import process from "node:process";
import { applyProfessionalReferral, verifyProfessionalReferralToken } from "../lib/professional-referrals.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const supabaseUrl = process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const signingSecret = process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET;
  if (!supabaseUrl || !serviceRoleKey || !signingSecret) {
    return res.status(503).json({ error: "Professional referral trials are not configured." });
  }

  const { token, referralToken } = req.body || {};
  if (typeof token !== "string" || !token) return res.status(401).json({ error: "Not authenticated" });
  const referral = verifyProfessionalReferralToken(referralToken, signingSecret);
  if (!referral) return res.status(400).json({ error: "This professional referral link is invalid or expired." });

  try {
    const userResponse = await fetch(`${supabaseUrl}/auth/v1/user`, {
      headers: { apikey: serviceRoleKey, Authorization: `Bearer ${token}` },
    });
    if (!userResponse.ok) return res.status(401).json({ error: "Invalid token" });
    const user = await userResponse.json();
    await applyProfessionalReferral({ supabaseUrl, serviceRoleKey, userId: user.id, referral });
    return res.status(200).json({ trialDays: 14 });
  } catch (error) {
    console.error("Professional referral activation failed:", error);
    return res.status(500).json({ error: "We couldn't activate the professional trial. Please contact support." });
  }
}
