import Stripe from "stripe";

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { token } = req.body;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: "Invalid token" });
    const user = await userRes.json();

    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=stripe_customer_id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const profiles = await profileRes.json();
    const customerId = profiles?.[0]?.stripe_customer_id;
    if (!customerId) return res.status(400).json({ error: "No subscription found" });

    const session = await stripe.billingPortal.sessions.create({
      customer: customerId,
      return_url: req.headers.origin || "https://mymeridianapp.com",
    });

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe portal error:", err);
    res.status(500).json({ error: "Failed to create portal session" });
  }
}
