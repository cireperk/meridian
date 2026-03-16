import crypto from "crypto";

export const config = { api: { bodyParser: false } };

async function buffer(readable) {
  const chunks = [];
  for await (const chunk of readable) chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  return Buffer.concat(chunks);
}

function verifySignature(payload, sigHeader, secret) {
  const parts = Object.fromEntries(sigHeader.split(",").map(p => { const [k, v] = p.split("="); return [k, v]; }));
  const timestamp = parts.t;
  const sig = parts.v1;
  const signedPayload = `${timestamp}.${payload}`;
  const expected = crypto.createHmac("sha256", secret).update(signedPayload).digest("hex");
  return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;

  const buf = await buffer(req);
  const sig = req.headers["stripe-signature"];

  try {
    if (!verifySignature(buf.toString(), sig, process.env.STRIPE_WEBHOOK_SECRET)) {
      return res.status(400).send("Invalid signature");
    }
  } catch (err) {
    console.error("Webhook signature error:", err.message);
    return res.status(400).send("Invalid signature");
  }

  const event = JSON.parse(buf.toString());

  const updateProfile = async (customerId, data) => {
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?stripe_customer_id=eq.${customerId}&select=id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const profiles = await profileRes.json();
    if (!profiles?.length) return;

    await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${profiles[0].id}`, {
      method: "PATCH",
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
  };

  const getSubscription = async (subId) => {
    const r = await fetch(`https://api.stripe.com/v1/subscriptions/${subId}`, {
      headers: { Authorization: `Bearer ${STRIPE_SECRET}` },
    });
    return r.json();
  };

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.customer) {
          const sub = await getSubscription(session.subscription);
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
