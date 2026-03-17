export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  const { token } = req.body;
  if (!token) return res.status(401).json({ error: "Not authenticated" });

  const debug = {};

  try {
    // 1. Get user
    const userRes = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
      headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${token}` },
    });
    const user = await userRes.json();
    debug.user_id = user.id;
    debug.user_ok = userRes.ok;

    // 2. Get profile row
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=stripe_customer_id,subscription_status,subscription_id,current_period_end,created_at`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const profiles = await profileRes.json();
    debug.profile = profiles?.[0] || null;
    debug.profile_raw_status = profileRes.status;

    // 3. If customer ID exists, check Stripe
    const customerId = profiles?.[0]?.stripe_customer_id;
    if (customerId) {
      const subRes = await fetch(
        `https://api.stripe.com/v1/subscriptions?customer=${customerId}&status=all&limit=3`,
        { headers: { Authorization: `Bearer ${STRIPE_SECRET}` } }
      );
      const subs = await subRes.json();
      debug.stripe_subscriptions = subs.data?.map(s => ({
        id: s.id, status: s.status, current_period_end: s.current_period_end,
      })) || [];
      debug.stripe_raw = subs.error || null;
    } else {
      debug.stripe_subscriptions = "no_customer_id";
    }

    // 4. Try a test PATCH to see if columns work
    if (user.id) {
      const patchRes = await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method: "PATCH",
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json", Prefer: "return=representation" },
        body: JSON.stringify({ subscription_status: profiles?.[0]?.subscription_status || "test_patch" }),
      });
      const patchResult = await patchRes.json();
      debug.patch_status = patchRes.status;
      debug.patch_result = patchResult;
    }
  } catch (err) {
    debug.error = err.message;
  }

  res.json(debug);
}
