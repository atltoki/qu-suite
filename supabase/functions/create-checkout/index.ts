// ════════════════════════════════════════════════════════════════════
// Edge Function : create-checkout
// Crée une session Stripe Checkout (abonnement) OU ouvre le portail client.
// Déploiement :  supabase functions deploy create-checkout --no-verify-jwt
// Secrets requis (supabase secrets set ...) :
//   STRIPE_SECRET_KEY          sk_live_... / sk_test_...
//   STRIPE_PRICE_STARTER       price_...  (abonnement 29€/mois)
//   STRIPE_PRICE_PRO           price_...  (abonnement 79€/mois)
//   SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY  (injectés automatiquement)
// ════════════════════════════════════════════════════════════════════
import Stripe from 'https://esm.sh/stripe@14?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2024-06-20',
  httpClient: Stripe.createFetchHttpClient(),
});

const PRICES: Record<string, string | undefined> = {
  starter: Deno.env.get('STRIPE_PRICE_STARTER'),
  pro: Deno.env.get('STRIPE_PRICE_PRO'),
};

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });

  try {
    // 1. Identifie l'utilisateur via son JWT Supabase.
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const admin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    );
    const { data: userData, error: userErr } = await admin.auth.getUser(token);
    if (userErr || !userData.user) return json({ error: 'Non authentifié' }, 401);
    const user = userData.user;

    const body = await req.json().catch(() => ({}));
    const origin = body.origin || req.headers.get('origin') || '';

    // 2. Récupère / crée le client Stripe lié au profil.
    const { data: profile } = await admin
      .from('profiles').select('*').eq('id', user.id).single();

    let customerId = profile?.stripe_customer_id as string | undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      });
      customerId = customer.id;
      await admin.from('profiles').update({ stripe_customer_id: customerId }).eq('id', user.id);
    }

    // 3a. Portail de gestion (changer de carte, annuler, factures).
    if (body.portal) {
      const portal = await stripe.billingPortal.sessions.create({
        customer: customerId,
        return_url: `${origin}/account.html`,
      });
      return json({ url: portal.url });
    }

    // 3b. Nouvelle session Checkout (abonnement).
    const priceId = PRICES[body.plan || 'pro'];
    if (!priceId) return json({ error: `Plan inconnu ou price manquant: ${body.plan}` }, 400);

    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customerId,
      line_items: [{ price: priceId, quantity: 1 }],
      allow_promotion_codes: true,
      success_url: `${origin}/hub2.html?checkout=success`,
      cancel_url: `${origin}/account.html?checkout=cancel`,
      subscription_data: { metadata: { supabase_user_id: user.id, plan: body.plan || 'pro' } },
      metadata: { supabase_user_id: user.id, plan: body.plan || 'pro' },
    });

    return json({ url: session.url });
  } catch (e) {
    return json({ error: (e as Error).message }, 500);
  }
});
