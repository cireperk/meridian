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

  const createRes = await fetch(`${SUPABASE_URL}/auth/v1/admin/users`, {
    method: "POST",
    headers: adminHeaders,
    body: JSON.stringify({ email, password, email_confirm: true }),
  });
  const createData = await createRes.json();

  if (!createRes.ok) {
    // User exists but wrong password
    if (createData.msg?.includes("already") || createData.message?.includes("already")) {
      return res.status(401).json({ error: "Incorrect password" });
    }
    return res.status(createRes.status).json({ error: createData.msg || createData.message || "Signup failed" });
  }

  // Explicitly set password (admin POST doesn't always persist it)
  await fetch(`${SUPABASE_URL}/auth/v1/admin/users/${createData.id}`, {
    method: "PUT",
    headers: adminHeaders,
    body: JSON.stringify({ password }),
  });

  // Sign in the new user to get tokens
  const newTokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: { apikey: SERVICE_ROLE_KEY, "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const newTokenData = await newTokenRes.json();

  if (!newTokenRes.ok) {
    return res.status(newTokenRes.status).json({ error: newTokenData.error_description || "Auth failed" });
  }

  return res.status(200).json({ ...newTokenData, isNew: true });
}
