export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { token } = req.body;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  try {
    // Get user from token
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    if (!userRes.ok) return res.status(401).json({ error: "Invalid token" });
    const user = await userRes.json();

    // Get stripe_customer_id from profile
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=stripe_customer_id`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const profiles = await profileRes.json();
    const customerId = profiles?.[0]?.stripe_customer_id;
    if (!customerId) return res.json({ status: null });

    // Query Stripe directly for this customer's subscriptions
    const subRes = await fetch(
      `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=all&limit=1`,
      { headers: { Authorization: `Bearer ${STRIPE_SECRET}` } }
    );
    const subs = await subRes.json();
    const sub = subs.data?.[0];

    if (sub) {
      const periodEnd = sub.current_period_end
        ? new Date(sub.current_period_end * 1000).toISOString()
        : null;
      const data = {
        subscription_status: sub.status,
        subscription_id: sub.id,
        current_period_end: periodEnd,
      };

      // Write to DB so future checks don't need to hit Stripe
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method: "PATCH",
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });

      return res.json({ status: sub.status, current_period_end: periodEnd });
    }

    res.json({ status: null });
  } catch (err) {
    console.error("Stripe verify error:", err);
    res.status(500).json({ error: "Failed to verify subscription" });
  }
}
