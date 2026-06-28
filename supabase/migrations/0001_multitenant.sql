-- ════════════════════════════════════════════════════════════════════
-- QU Suite — Migration multi-locataire (multi-tenant) + RLS + abonnements
-- ════════════════════════════════════════════════════════════════════
-- À coller dans Supabase → SQL Editor → Run.
-- Idempotent : peut être relancé sans casse.
--
-- Principe : chaque ligne appartient à un utilisateur (user_id = auth.uid()).
-- La RLS (Row Level Security) garantit qu'un client ne voit/écrit QUE ses
-- propres données. Le `default auth.uid()` remplit user_id automatiquement
-- à l'insertion → tes requêtes existantes (.insert/.select) marchent sans
-- modification.
-- ════════════════════════════════════════════════════════════════════

-- ─────────────────────────────────────────────
-- 1. Table profiles : 1 ligne par utilisateur, porte l'état d'abonnement
-- ─────────────────────────────────────────────
create table if not exists public.profiles (
  id                     uuid primary key references auth.users(id) on delete cascade,
  email                  text,
  full_name              text,
  company                text,
  stripe_customer_id     text unique,
  subscription_status    text not null default 'none', -- none | trialing | active | past_due | canceled
  subscription_plan      text,                          -- starter | pro | ...
  trial_ends_at          timestamptz,
  current_period_end     timestamptz,
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

alter table public.profiles enable row level security;

-- Un utilisateur lit/modifie uniquement son propre profil.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles
  for select using (auth.uid() = id);

drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles
  for update using (auth.uid() = id);

-- (Aucune policy insert/delete pour les clients : c'est le trigger ci-dessous
--  et les webhooks Stripe — via service_role, qui bypass la RLS — qui écrivent.)

-- Auto-création du profil à l'inscription (avec 14 jours d'essai).
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, subscription_status, trial_ends_at)
  values (new.id, new.email, 'trialing', now() + interval '14 days')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Helper : l'utilisateur a-t-il un accès actif (essai non expiré OU abonné) ?
create or replace function public.has_active_access()
returns boolean
language sql
stable
security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = auth.uid()
      and (
        p.subscription_status in ('active', 'trialing')
        and (p.trial_ends_at is null or p.trial_ends_at > now() or p.subscription_status = 'active')
      )
  );
$$;

-- ─────────────────────────────────────────────
-- 2. Ajout de user_id + RLS sur toutes les tables métier
-- ─────────────────────────────────────────────
-- Boucle sur la liste des tables. Pour chacune :
--   • ajoute la colonne user_id uuid not null default auth.uid()
--   • référence auth.users, index
--   • active la RLS
--   • crée la policy "tout (CRUD) sur mes propres lignes"
do $$
declare
  t text;
  tables text[] := array[
    'qu_products', 'qu_orders', 'qu_order_items', 'qu_tracking_tokens',
    'qu_scan_history', 'qu_invoices', 'qu_invoice_items',
    'clients', 'stocks'
  ];
begin
  foreach t in array tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'Table % absente, ignorée.', t;
      continue;
    end if;

    -- colonne user_id
    execute format(
      'alter table public.%I add column if not exists user_id uuid not null default auth.uid()',
      t
    );
    -- FK vers auth.users
    execute format(
      'do $f$ begin
         if not exists (
           select 1 from information_schema.table_constraints
           where constraint_name = %L and table_name = %L
         ) then
           alter table public.%I
             add constraint %I foreign key (user_id)
             references auth.users(id) on delete cascade;
         end if;
       end $f$;',
      t || '_user_id_fkey', t, t, t || '_user_id_fkey'
    );
    -- index
    execute format(
      'create index if not exists %I on public.%I (user_id)',
      'idx_' || t || '_user_id', t
    );
    -- RLS
    execute format('alter table public.%I enable row level security', t);
    execute format('drop policy if exists %I on public.%I', t || '_own', t);
    execute format(
      'create policy %I on public.%I
         for all
         using (auth.uid() = user_id)
         with check (auth.uid() = user_id)',
      t || '_own', t
    );

    raise notice 'OK : % (user_id + RLS).', t;
  end loop;
end $$;

-- ─────────────────────────────────────────────
-- 3. Tables CRM dynamiques (schéma {id, data jsonb, ...})
-- ─────────────────────────────────────────────
-- Le CRM crée des tables à la volée via ENTITY_CONFIG. Modèle recommandé
-- pour chacune (ex. contacts, deals, tasks...) — décommente/duplique selon
-- tes entités réelles. Même patron RLS.
--
-- create table if not exists public.contacts (
--   id          uuid primary key default gen_random_uuid(),
--   user_id     uuid not null default auth.uid() references auth.users(id) on delete cascade,
--   data        jsonb not null default '{}'::jsonb,
--   created_at  timestamptz not null default now(),
--   updated_at  timestamptz not null default now()
-- );
-- alter table public.contacts enable row level security;
-- create policy "contacts_own" on public.contacts
--   for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ════════════════════════════════════════════════════════════════════
-- FIN. Après ce script :
--   • Active RLS est ON partout (vérifie Database → Tables → RLS = enabled)
--   • Les données existantes ont user_id = NULL → réassigne-les à ton
--     compte admin une fois ton user créé, ex :
--       update public.qu_orders set user_id = '<TON-UUID>' where user_id is null;
--     (répète pour chaque table) sinon elles deviennent invisibles sous RLS.
-- ════════════════════════════════════════════════════════════════════
