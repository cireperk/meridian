import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import process from "node:process";
import { createProfessionalReferralToken } from "../lib/professional-referrals.js";

function matchesSecret(provided, expected) {
  if (typeof provided !== "string" || typeof expected !== "string") return false;
  const providedBuffer = Buffer.from(provided);
  const expectedBuffer = Buffer.from(expected);
  return providedBuffer.length === expectedBuffer.length && timingSafeEqual(providedBuffer, expectedBuffer);
}

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });

  const adminKey = process.env.PROFESSIONAL_REFERRAL_ADMIN_KEY;
  const signingSecret = process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET;
  if (!adminKey || adminKey.length < 32 || !signingSecret || signingSecret.length < 32) {
    return res.status(503).json({ error: "Professional referral links are not configured." });
  }

  const authorization = req.headers.authorization || "";
  const bearer = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!matchesSecret(bearer, adminKey)) {
    return res.status(401).json({ error: "Not authorized" });
  }

  try {
    const token = createProfessionalReferralToken(req.body?.practiceName, signingSecret);
    const siteUrl = new URL(process.env.PUBLIC_APP_URL || "https://www.mymeridianapp.com");
    if (siteUrl.protocol !== "https:" && siteUrl.hostname !== "localhost") {
      return res.status(500).json({ error: "PUBLIC_APP_URL must use HTTPS." });
    }
    const referralUrl = new URL("/signup", siteUrl);
    referralUrl.searchParams.set("ref", token);
    console.info("meridian_event", JSON.stringify({ event: "professional_referral_link_issued", at: new Date().toISOString() }));
    return res.status(200).json({ url: referralUrl.toString() });
  } catch (error) {
    return res.status(400).json({ error: error.message || "Invalid referral request." });
  }
}
