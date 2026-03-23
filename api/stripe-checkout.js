export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const STRIPE_SECRET = process.env.STRIPE_SECRET_KEY;
  const STRIPE_PRICE_ID = process.env.STRIPE_PRICE_ID;
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

    // Check if user already has a Stripe customer ID
    const profileRes = await fetch(
      `${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}&select=stripe_customer_id,email`,
      { headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}` } }
    );
    const profiles = await profileRes.json();
    let customerId = profiles?.[0]?.stripe_customer_id;

    if (!customerId) {
      // Create Stripe customer
      const custRes = await fetch("https://api.stripe.com/v1/customers", {
        method: "POST",
        headers: { Authorization: `Bearer ${STRIPE_SECRET}`, "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ email: user.email || profiles?.[0]?.email || "", "metadata[supabase_user_id]": user.id }),
      });
      const customer = await custRes.json();
      if (customer.error) throw new Error(customer.error.message);
      customerId = customer.id;

      // Save customer ID to profile
      await fetch(`${SUPABASE_URL}/rest/v1/profiles?id=eq.${user.id}`, {
        method: "PATCH",
        headers: { apikey: SERVICE_ROLE_KEY, Authorization: `Bearer ${SERVICE_ROLE_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ stripe_customer_id: customerId }),
      });
    }

    // Create checkout session
    const origin = req.headers.origin || "https://mymeridianapp.com";
    const sessionRes = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: { Authorization: `Bearer ${STRIPE_SECRET}`, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        customer: customerId,
        "payment_method_types[0]": "card",
        "line_items[0][price]": STRIPE_PRICE_ID,
        "line_items[0][quantity]": "1",
        mode: "subscription",
        success_url: `${origin}/#subscription=success`,
        cancel_url: `${origin}/#subscription=cancelled`,
        "metadata[supabase_user_id]": user.id,
      }),
    });
    const session = await sessionRes.json();
    if (session.error) throw new Error(session.error.message);

    res.json({ url: session.url });
  } catch (err) {
    console.error("Stripe checkout error:", err);
    res.status(500).json({ error: "Failed to create checkout session", detail: err?.message || String(err) });
  }
}
