const ALLOWED_EVENTS = new Set([
  "signup_attempted",
  "signup_completed",
  "signin_attempted",
  "signin_completed",
  "guide_search",
  "professional_referral_requested",
  "professional_referral_link_issued",
]);

export default async function handler(req, res) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).end();

  const origin = req.headers.origin;
  const requestHost = (req.headers["x-forwarded-host"] || req.headers.host || "").toLowerCase();
  let originHost = "";
  try {
    originHost = new URL(origin).host.toLowerCase();
  } catch {
    return res.status(403).end();
  }
  if (!requestHost || originHost !== requestHost) return res.status(403).end();

  const event = req.body?.event;
  if (typeof event !== "string" || !ALLOWED_EVENTS.has(event)) {
    return res.status(400).end();
  }

  console.info("meridian_event", JSON.stringify({ event, at: new Date().toISOString() }));
  return res.status(204).end();
}
