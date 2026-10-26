import { Buffer } from "node:buffer";
import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

const REFERRAL_TOKEN_LIFETIME_SECONDS = 365 * 24 * 60 * 60;
const MAX_ACCOUNT_AGE_MS = 30 * 24 * 60 * 60 * 1000;

export function createProfessionalReferralToken(practiceName, secret, now = Date.now()) {
  const name = typeof practiceName === "string" ? practiceName.trim() : "";
  if (!name || name.length > 120 || [...name].some((character) => {
    const code = character.charCodeAt(0);
    return code < 32 || code === 127;
  })) {
    throw new Error("Practice name must be 1 to 120 characters.");
  }
  if (typeof secret !== "string" || secret.length < 32) {
    throw new Error("Referral signing secret must be at least 32 characters.");
  }

  const issuedAt = Math.floor(now / 1000);
  const payload = {
    version: 1,
    id: randomUUID(),
    practiceName: name,
    issuedAt,
    expiresAt: issuedAt + REFERRAL_TOKEN_LIFETIME_SECONDS,
  };
  const encodedPayload = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const signature = createHmac("sha256", secret).update(encodedPayload).digest("base64url");
  return `${encodedPayload}.${signature}`;
}

export function verifyProfessionalReferralToken(token, secret, now = Date.now()) {
  if (typeof token !== "string" || token.length > 2048 || typeof secret !== "string" || secret.length < 32) {
    return null;
  }

  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;

  const expectedSignature = createHmac("sha256", secret).update(encodedPayload).digest();
  let suppliedSignature;
  try {
    suppliedSignature = Buffer.from(encodedSignature, "base64url");
  } catch {
    return null;
  }
  if (expectedSignature.length !== suppliedSignature.length || !timingSafeEqual(expectedSignature, suppliedSignature)) {
    return null;
  }

  try {
    const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
    const nowSeconds = Math.floor(now / 1000);
    if (
      payload.version !== 1 ||
      typeof payload.id !== "string" ||
      typeof payload.practiceName !== "string" ||
      !Number.isInteger(payload.issuedAt) ||
      !Number.isInteger(payload.expiresAt) ||
      payload.issuedAt > nowSeconds + 60 ||
      payload.expiresAt <= nowSeconds ||
      payload.expiresAt - payload.issuedAt > REFERRAL_TOKEN_LIFETIME_SECONDS
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export async function applyProfessionalReferral({ supabaseUrl, serviceRoleKey, userId, referral }) {
  const userResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    headers: { apikey: serviceRoleKey, Authorization: `Bearer ${serviceRoleKey}` },
  });
  if (!userResponse.ok) throw new Error(`Supabase user lookup failed (${userResponse.status}).`);

  const responseData = await userResponse.json();
  const user = responseData.user ?? responseData;
  const createdAt = Date.parse(user.created_at);
  if (!Number.isFinite(createdAt) || Date.now() - createdAt > MAX_ACCOUNT_AGE_MS) {
    throw new Error("The referral link can only be applied to a recently created account.");
  }

  const appMetadata = user.app_metadata || {};
  const existingReferralId = appMetadata.meridian_professional_referral_id;
  if (existingReferralId) {
    if (existingReferralId === referral.id) return;
    throw new Error("A professional referral is already associated with this account.");
  }

  const updateResponse = await fetch(`${supabaseUrl}/auth/v1/admin/users/${encodeURIComponent(userId)}`, {
    method: "PUT",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      app_metadata: {
        ...appMetadata,
        meridian_professional_trial_days: 14,
        meridian_professional_referral_id: referral.id,
        meridian_professional_referral_name: referral.practiceName,
      },
    }),
  });
  if (!updateResponse.ok) throw new Error(`Supabase referral update failed (${updateResponse.status}).`);
}
