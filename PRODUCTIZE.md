# QU Suite → SaaS multi-locataire : guide de mise en production

Ce dépôt contient désormais tout le nécessaire pour transformer QU Suite en
**produit vendable en self-service** : inscription, isolation des données par
client (RLS), essai gratuit, et abonnement Stripe automatique.

Ce qui a été ajouté :

| Fichier | Rôle |
|---|---|
| `supabase/migrations/0001_multitenant.sql` | Ajoute `user_id` + RLS sur toutes les tables, table `profiles`, essai 14 j |
| `qu-auth.js` | Module partagé : connexion, garde de page, jeton de session, Stripe |
| `login.html` | Inscription + connexion (Supabase Auth) |
| `account.html` | État de l'abonnement + paiement / portail Stripe |
| `landing.html` | Page de vente publique (la pièce qui convertit) |
| `supabase/functions/create-checkout/` | Crée la session Stripe Checkout / portail |
| `supabase/functions/stripe-webhook/` | Met à jour l'abonnement (active/coupe l'accès) |
| `hub2/app2/crm2/dashboard2/admin2/cockpit2.html` | **Copies gated** de l'app, destinées aux clients (`data-qu-gate="access"`) |

> 🛡️ **Tes fichiers d'origine** (`index/app/crm/dashboard/admin/cockpit.html`)
> ne sont **pas modifiés** — ils restent ton app perso. Tout le SaaS vit dans
> des fichiers neufs (suffixe `2` + les pages d'auth). Tu peux merger sans
> rien casser de ce que tu utilises.

### Architecture en deux suites parallèles

```
PUBLIC                         CLIENT (payant, isolé)         TOI (perso, inchangé)
landing.html  →  login.html  →  hub2.html ─┬─ app2.html        index.html ─┬─ app.html
                 account.html               ├─ crm2.html        (ungated)   ├─ crm.html
                 (paiement Stripe)          ├─ dashboard2.html              ├─ dashboard.html
                                            ├─ admin2.html                  ├─ admin.html
                                            └─ cockpit2.html                └─ cockpit.html
```

Les deux suites tapent le **même Supabase**, mais la RLS isole les données par
utilisateur. Une fois la RLS active, **même tes pages perso non-gated sont
sûres** : sans session connectée → aucune ligne renvoyée ; avec ta session →
tes données à toi. Tu continues donc à utiliser tes fichiers d'origine
normalement (connecte-toi une fois via le SaaS et ta session est partagée).

---

## ⚠️ À faire AVANT d'ouvrir aux clients (ordre important)

### 1. Activer la RLS et migrer le schéma
1. Supabase → **SQL Editor** → colle `supabase/migrations/0001_multitenant.sql` → **Run**.
2. Vérifie **Database → Tables** : chaque table doit afficher *RLS enabled*.
3. **Tes données actuelles** ont `user_id = NULL` → elles deviennent invisibles
   sous RLS. Crée d'abord ton propre compte (étape 4), récupère ton UUID
   (Supabase → Authentication → Users), puis réassigne :
   ```sql
   update public.qu_orders        set user_id = '<TON-UUID>' where user_id is null;
   update public.qu_order_items   set user_id = '<TON-UUID>' where user_id is null;
   update public.qu_products      set user_id = '<TON-UUID>' where user_id is null;
   update public.qu_invoices      set user_id = '<TON-UUID>' where user_id is null;
   update public.qu_invoice_items set user_id = '<TON-UUID>' where user_id is null;
   update public.qu_scan_history  set user_id = '<TON-UUID>' where user_id is null;
   update public.qu_tracking_tokens set user_id = '<TON-UUID>' where user_id is null;
   update public.clients          set user_id = '<TON-UUID>' where user_id is null;
   update public.stocks           set user_id = '<TON-UUID>' where user_id is null;
   ```

### 2. Configurer l'authentification
- Supabase → **Authentication → Providers → Email** : activé.
- Pour un lancement rapide tu peux **désactiver « Confirm email »** (connexion
  immédiate après inscription). Réactive-le ensuite pour la production.
- **Authentication → URL Configuration** : ajoute l'URL de ton site (ex.
  `https://qu-suite.pages.dev`) dans *Site URL* et *Redirect URLs*.

### 3. Créer les produits Stripe
1. [Stripe Dashboard](https://dashboard.stripe.com) → **Products** → crée 2 prix
   **récurrents mensuels** : Starter (29 €) et Pro (79 €).
2. Note les `price_...` de chacun.

### 4. Déployer les Edge Functions
```bash
supabase link --project-ref hofctcynzmqufgpqcavi

# Secrets
supabase secrets set STRIPE_SECRET_KEY=sk_live_xxx
supabase secrets set STRIPE_PRICE_STARTER=price_xxx
supabase secrets set STRIPE_PRICE_PRO=price_xxx
# (SUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY sont injectés automatiquement)

supabase functions deploy create-checkout --no-verify-jwt
supabase functions deploy stripe-webhook  --no-verify-jwt
```

### 5. Brancher le webhook Stripe
1. Stripe → **Developers → Webhooks → Add endpoint**
   - URL : `https://hofctcynzmqufgpqcavi.supabase.co/functions/v1/stripe-webhook`
   - Événements : `checkout.session.completed`, `customer.subscription.updated`,
     `customer.subscription.deleted`, `invoice.payment_failed`
2. Copie le **Signing secret** (`whsec_...`) puis :
   ```bash
   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_xxx
   supabase functions deploy stripe-webhook --no-verify-jwt
   ```

### 6. Tester le parcours complet
1. Ouvre `landing.html` → **Essai gratuit** → crée un compte.
2. Tu arrives connecté, en essai 14 j → l'app est accessible.
3. Tu atterris sur `hub2.html` (le hub client gated) → les modules `2` marchent.
4. `account.html` → **Choisir Pro** → paie avec la carte test `4242 4242 4242 4242`.
5. Vérifie dans Supabase que `profiles.subscription_status = 'active'`.
6. Déconnecte-toi, ouvre `hub2.html` → tu es bien renvoyé vers `login.html`.

---

## Comment ça marche (architecture)

- **Un seul projet Supabase**, partagé par tous les clients. La clé `anon`
  publique est sans danger **parce que la RLS** filtre tout par `auth.uid()`.
- À l'inscription, un trigger crée un `profile` avec **14 jours d'essai**.
- `qu-auth.js` pose une **garde** (`data-qu-gate="access"`) sur les pages `2` :
  pas connecté → `login.html` ; essai expiré / non abonné → `account.html`.
- Les pages `2` en `supabase-js` (app2, crm2, admin2, cockpit2) partagent
  automatiquement la session ; celles en REST brut (hub2, dashboard2)
  utilisent `QUAuth.restHeaders()` pour envoyer le jeton de l'utilisateur.
- Les pages `2` ne pointent QUE vers d'autres pages `2` (navigation isolée) ;
  tes fichiers d'origine ne sont jamais référencés par le SaaS.
- Le **webhook Stripe** est la seule source de vérité de l'abonnement : il
  passe `subscription_status` à `active` / `past_due` / `canceled`.

---

## Reste à faire (phase 2, optionnel)

- [ ] Retirer le **modal « Configuration Supabase »** d'`app2.html` (relique
      mono-locataire : un client ne doit pas pouvoir changer la base).
- [ ] Quand le SaaS est validé, héberger les pages `2` sur un domaine/déploiement
      distinct de ton app perso (ou retirer les originaux du déploiement client).
- [ ] Créer explicitement les **tables CRM** (`contacts`, `deals`, …) avec le
      patron RLS commenté en bas de la migration.
- [ ] Page d'**onboarding** post-inscription (logo, première donnée).
- [ ] Comptes **multi-utilisateurs par organisation** (passer de `user_id` à
      `org_id` + table `memberships`).
- [ ] Emails transactionnels (bienvenue, fin d'essai) via Stripe + Supabase.

---

## Stratégie de prix (pour rentabiliser tes abonnements IA)

Tes abonnements Claude Max + ChatGPT Plus coûtent ~110–220 €/mois.

> **2 clients Starter (29 €) ou 1 seul client Pro (79 €) ≈ abonnements remboursés.**

Cible : indépendants / TPE e-commerce qui jonglent avec un tableur + 4 outils.
Lance avec un tarif « early adopter » (-50 % à vie pour les 10 premiers) pour
amorcer, puis remonte au plein tarif. Le levier IA : tu construis et fais
évoluer le produit 3–5× plus vite, donc chaque euro d'abonnement encaissé est
quasi pure marge.
