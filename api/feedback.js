export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { feedback, userId, email } = req.body;
  if (!feedback || !feedback.trim()) {
    return res.status(400).json({ error: "Feedback is required" });
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (SUPABASE_URL && SERVICE_ROLE_KEY) {
    try {
      const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/feedback`, {
        method: "POST",
        headers: {
          apikey: SERVICE_ROLE_KEY,
          Authorization: `Bearer ${SERVICE_ROLE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          user_id: userId || null,
          email: email || null,
          message: feedback.trim(),
        }),
      });

      if (sbRes.ok) {
        return res.status(200).json({ ok: true });
      }

      // Table might not exist yet — fall through to log
      const errText = await sbRes.text();
      console.error("Supabase feedback insert error:", errText);
    } catch (err) {
      console.error("Supabase feedback error:", err);
    }
  }

  // Fallback: log to Vercel function logs
  console.log("[FEEDBACK]", new Date().toISOString(), email || "anon", feedback.trim());
  return res.status(200).json({ ok: true, method: "logged" });
}
