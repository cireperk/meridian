export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server auth not configured" });
  }

  const adminHeaders = {
    apikey: SERVICE_ROLE_KEY,
    Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
    "Content-Type": "application/json",
  };

  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }

  // Try sign-in first
  const tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });

  if (tokenRes.ok) {
    const tokenData = await tokenRes.json();
    return res.status(200).json({ ...tokenData, isNew: false });
  }

  // Sign-in failed — check if it's an unconfirmed user
  const tokenErr = await tokenRes.json().catch(() => ({}));
  if (tokenErr.error === "invalid_grant" && tokenErr.error_description?.includes("Email not confirmed")) {
    return res.status(200).json({ needsConfirmation: true, email });
  }

  // Sign-in failed — try creating the user
  // Enforce password requirements for new accounts
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({ error: "Password must include an uppercase letter" });
  }
  if (!/[0-9]/.test(password)) {
    return res.status(400).json({ error: "Password must include a number" });
  }

  // Use regular signup endpoint so Supabase sends confirmation email
  const signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const signupData = await signupRes.json();

  if (!signupRes.ok) {
    if (signupData.msg?.includes("already") || signupData.message?.includes("already")) {
      return res.status(401).json({ error: "Incorrect password" });
    }
    return res.status(signupRes.status).json({ error: signupData.msg || signupData.message || "Signup failed" });
  }

  // If Supabase returns a session, email confirmation is disabled — sign them in
  if (signupData.access_token) {
    return res.status(200).json({ ...signupData, isNew: true });
  }

  // Email confirmation is enabled — user needs to confirm
  return res.status(200).json({ needsConfirmation: true, email, isNew: true });
}
