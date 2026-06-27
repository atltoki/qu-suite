// ════════════════════════════════════════════════════════════════════
// Edge Function : stripe-webhook
// Reçoit les événements Stripe et met à jour profiles.subscription_status.
// C'est CE fichier qui débloque/coupe l'accès des clients automatiquement.
//
// Déploiement :  supabase functions deploy stripe-webhook --no-verify-jwt
// Secrets requis :
//   STRIPE_SECRET_KEY          sk_live_... / sk_test_...
//   STRIPE_WEBHOOK_SECRET      whsec_...  (donné par Stripe à la création du endpoint)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (injectés automatiquement)
//
// Dans Stripe → Developers → Webhooks → Add endpoint :
//   URL    : https://<projet>.supabase.co/functions/v1/stripe-webhook
//   Events : checkout.session.completed, customer.subscription.updated,
//            customer.subscription.deleted, invoice.payment_failed
// ════════════════════════════════════════════════════════════════════
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});
const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;
const admin = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
);

// Met à jour le profil à partir d'un objet subscription Stripe.
async function syncSubscription(sub: Stripe.Subscription) {
  const userId = sub.metadata?.supabase_user_id;
  const customerId = typeof sub.customer === 'string' ? sub.customer : sub.customer.id;

  // statut Stripe → statut interne
  const map: Record<string, string> = {
    active: 'active', trialing: 'trialing', past_due: 'past_due',
    canceled: 'canceled', unpaid: 'past_due', incomplete: 'none',
    incomplete_expired: 'canceled', paused: 'canceled',
  };
  const status = map[sub.status] || 'none';
  const plan = sub.metadata?.plan || null;
  const periodEnd = sub.current_period_end
    ? new Date(sub.current_period_end * 1000).toISOString() : null;

  const patch: Record<string, unknown> = {
    subscription_status: status,
    subscription_plan: plan,
    current_period_end: periodEnd,
    updated_at: new Date().toISOString(),
  };

  // On cible par user_id si présent, sinon par customer Stripe.
  const query = admin.from('profiles').update(patch);
  if (userId) await query.eq('id', userId);
  else await query.eq('stripe_customer_id', customerId);
}

Deno.serve(async (req) => {
  const signature = req.headers.get('stripe-signature');
  const payload = await req.text();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(payload, signature!, webhookSecret);
  } catch (e) {
    return new Response(`Webhook invalide: ${(e as Error).message}`, { status: 400 });
  }

  try {
    switch (event.type) {
      case 'checkout.session.completed': {
        const s = event.data.object as Stripe.Checkout.Session;
        if (s.subscription) {
          const sub = await stripe.subscriptions.retrieve(s.subscription as string);
          // reporte les metadata de la session sur la subscription si besoin
          if (!sub.metadata?.supabase_user_id && s.metadata?.supabase_user_id) {
            sub.metadata = { ...sub.metadata, ...s.metadata };
          }
          await syncSubscription(sub);
        }
        break;
      }
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await syncSubscription(event.data.object as Stripe.Subscription);
        break;
      case 'invoice.payment_failed': {
        const inv = event.data.object as Stripe.Invoice;
        if (inv.subscription) {
          const sub = await stripe.subscriptions.retrieve(inv.subscription as string);
          await syncSubscription(sub);
        }
        break;
      }
      default:
        break;
    }
    return new Response(JSON.stringify({ received: true }), {
      status: 200, headers: { 'Content-Type': 'application/json' },
    });
  } catch (e) {
    return new Response(`Erreur traitement: ${(e as Error).message}`, { status: 500 });
  }
});
