export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { feedback, userId, email } = req.body;
  if (!feedback || !feedback.trim()) {
    return res.status(400).json({ error: "Feedback is required" });
  }

  const RESEND_API_KEY = process.env.RESEND_API_KEY;
  if (!RESEND_API_KEY) {
    console.log("[FEEDBACK]", new Date().toISOString(), email || "anon", feedback.trim());
    return res.status(200).json({ ok: true, method: "logged" });
  }

  try {
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${RESEND_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Meridian Feedback <onboarding@resend.dev>",
        to: "support@mymeridianapp.com",
        reply_to: email || undefined,
        subject: `Feedback from ${email || "anonymous user"}`,
        html: `<div style="font-family: -apple-system, sans-serif; max-width: 560px;">
          <h2 style="color: #1e293b; font-weight: 400; margin-bottom: 4px;">New feedback</h2>
          <p style="color: #94a3b8; font-size: 13px; margin-top: 0;">From ${email || "anonymous"}</p>
          <div style="background: #f8fafc; border-radius: 12px; padding: 20px; margin: 16px 0; color: #334155; font-size: 15px; line-height: 1.6; white-space: pre-wrap;">${feedback.trim().replace(/</g, "&lt;").replace(/>/g, "&gt;")}</div>
          <p style="color: #94a3b8; font-size: 12px;">User ID: ${userId || "n/a"}</p>
          ${email ? `<p style="margin-top: 16px;"><a href="mailto:${email}" style="color: #10b981; font-size: 14px;">Reply to ${email}</a></p>` : ""}
        </div>`,
      }),
    });

    if (!emailRes.ok) {
      const err = await emailRes.text();
      console.error("Resend error:", err);
      return res.status(200).json({ ok: true, method: "logged" });
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    console.error("Feedback email error:", err);
    return res.status(200).json({ ok: true, method: "logged" });
  }
}
