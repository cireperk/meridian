import Stripe from "stripe";

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"];

  let event;
  try {
    event = stripe.webhooks.constructEvent(buf, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error("Webhook signature verification failed:", err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  const updateProfile = async (customerId, data) => {
    // Look up user by stripe_customer_id
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?stripe_customer_id=eq.${customerId}&select=id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const profiles = await profileRes.json();
    if (!profiles?.length) return;

    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profiles[0].id}`, {
      method: "PATCH",
      headers: {
        apikey: SERVICE_ROLE_KEY,
        Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(data),
    });
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.customer) {
          const sub = await stripe.subscriptions.retrieve(session.subscription);
          await updateProfile(session.customer, {
            subscription_status: sub.status,
            subscription_id: sub.id,
            current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
          });
        }
        break;
      }
      case "customer.subscription.updated": {
        const sub = event.data.object;
        await updateProfile(sub.customer, {
          subscription_status: sub.status,
          subscription_id: sub.id,
          current_period_end: new Date(sub.current_period_end * 1000).toISOString(),
        });
        break;
      }
      case "customer.subscription.deleted": {
        const sub = event.data.object;
        await updateProfile(sub.customer, {
          subscription_status: "cancelled",
          subscription_id: null,
          current_period_end: null,
        });
        break;
      }
    }
  } catch (err) {
    console.error("Webhook processing error:", err);
  }

  res.json({ received: true });
}
