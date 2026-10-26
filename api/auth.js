import process from "node:process";
import { applyProfessionalReferral, verifyProfessionalReferralToken } from "../lib/professional-referrals.js";

export default async function handler(req, res) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") return res.status(200).end();
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const SUPABASE_URL = process.env.VITE_SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: "Server auth not configured" });
  }

  const { email, password, intent, referral: referralToken } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: "Email and password are required" });
  }

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: "Please enter a valid email address" });
  }

  // Try sign-in first
  let tokenRes;
  try {
    tokenRes = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
      method: "POST",
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch (err) {
    console.error("Supabase sign-in request failed:", err);
    return res.status(502).json({ error: "Unable to reach the account service. Please try again." });
  }

  if (tokenRes.ok) {
    const tokenData = await tokenRes.json();
    const user = tokenData.user;
    const pendingReferralToken = user?.user_metadata?.meridian_professional_referral_token;
    const signingSecret = process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET;
    const referral = pendingReferralToken && signingSecret
      ? verifyProfessionalReferralToken(pendingReferralToken, signingSecret)
      : null;
    const accountAgeMs = user?.created_at ? Date.now() - Date.parse(user.created_at) : Infinity;
    if (
      referral &&
      !user.app_metadata?.meridian_professional_referral_id &&
      Number.isFinite(accountAgeMs) &&
      accountAgeMs <= 30 * 24 * 60 * 60 * 1000
    ) {
      try {
        await applyProfessionalReferral({
          supabaseUrl: SUPABASE_URL,
          serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
          userId: user.id,
          referral,
        });
      } catch (err) {
        console.error("Professional referral activation failed during sign-in:", err);
        return res.status(503).json({ error: "We couldn't activate your professional trial. Please try again or contact support." });
      }
    }
    return res.status(200).json({ ...tokenData, isNew: false });
  }

  // Sign-in failed — if user intended to sign in, don't silently create an account
  if (intent === "signin") {
    return res.status(401).json({ error: "Invalid email or password" });
  }

  // Sign-up flow — enforce password requirements for new accounts
  if (password.length < 8) {
    return res.status(400).json({ error: "Password must be at least 8 characters" });
  }
  if (!/[A-Z]/.test(password)) {
    return res.status(400).json({ error: "Password must include an uppercase letter" });
  }
  if (!/[0-9]/.test(password)) {
    return res.status(400).json({ error: "Password must include a number" });
  }

  let professionalReferral = null;
  if (referralToken) {
    const signingSecret = process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET;
    if (!signingSecret) {
      return res.status(503).json({ error: "Professional referral trials are not configured. Please contact your provider." });
    }
    professionalReferral = verifyProfessionalReferralToken(referralToken, signingSecret);
    if (!professionalReferral) {
      return res.status(400).json({ error: "This professional referral link is invalid or expired." });
    }
  }

  // Use regular signup endpoint so Supabase sends confirmation email
  let signupRes;
  let signupData;
  try {
    signupRes = await fetch(`${SUPABASE_URL}/auth/v1/signup`, {
      method: "POST",
      headers: { apikey: SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json" },
      body: JSON.stringify({
        email,
        password,
        ...(professionalReferral ? { data: { meridian_professional_referral_token: referralToken } } : {}),
      }),
    });
    signupData = await signupRes.json();
  } catch (err) {
    console.error("Supabase signup request failed:", err);
    return res.status(502).json({ error: "Unable to complete signup. Please try again." });
  }

  if (!signupRes.ok) {
    if (signupData.msg?.includes("already") || signupData.message?.includes("already")) {
      return res.status(409).json({ error: "An account with this email may already exist. Try signing in or resetting your password." });
    }
    return res.status(signupRes.status).json({ error: signupData.msg || signupData.message || "Signup failed" });
  }

  const signupUser = signupData.user ?? (signupData.id ? signupData : null);
  if (professionalReferral && signupUser?.id) {
    try {
      await applyProfessionalReferral({
        supabaseUrl: SUPABASE_URL,
        serviceRoleKey: SUPABASE_SERVICE_ROLE_KEY,
        userId: signupUser.id,
        referral: professionalReferral,
      });
    } catch (err) {
      console.error("Professional referral activation failed after signup:", err);
      return res.status(502).json({ error: "Your account was created, but we couldn't activate the professional trial. Please sign in again or contact support." });
    }
  }

  if (!signupData.access_token) {
    if (signupUser?.id) {
      return res.status(200).json({ user: signupUser, isNew: true, confirmationRequired: true });
    }
    return res.status(502).json({ error: "Could not complete signup. Please try again." });
  }

  return res.status(200).json({ ...signupData, isNew: true });
}
