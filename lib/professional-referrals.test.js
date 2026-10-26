import assert from "node:assert/strict";
import test from "node:test";
import {
  applyProfessionalReferral,
  createProfessionalReferralToken,
  verifyProfessionalReferralToken,
} from "./professional-referrals.js";

const secret = "meridian-referral-test-secret-that-is-long-enough";
const now = Date.UTC(2026, 0, 1);

test("signed referral links retain their attribution and expire after one year", () => {
  const token = createProfessionalReferralToken("Example Family Law", secret, now);

  assert.equal(verifyProfessionalReferralToken(token, secret, now)?.practiceName, "Example Family Law");
  assert.equal(verifyProfessionalReferralToken(token, secret, now + 366 * 24 * 60 * 60 * 1000), null);
});

test("referral links reject tampering and a different signing secret", () => {
  const token = createProfessionalReferralToken("Example Family Law", secret, now);
  const [payload, signature] = token.split(".");
  const tamperedToken = `${payload}.${signature.slice(0, -1)}${signature.endsWith("a") ? "b" : "a"}`;

  assert.equal(verifyProfessionalReferralToken(tamperedToken, secret, now), null);
  assert.equal(verifyProfessionalReferralToken(token, `${secret}different`, now), null);
});

test("referral links reject invalid practice names", () => {
  assert.throws(() => createProfessionalReferralToken(" ", secret, now));
  assert.throws(() => createProfessionalReferralToken("Bad\nName", secret, now));
});

test("applying a referral adds trial attribution without replacing other app metadata", async () => {
  const originalFetch = globalThis.fetch;
  let updatedMetadata;
  globalThis.fetch = async (_url, options = {}) => {
    if (options.method === "PUT") {
      updatedMetadata = JSON.parse(options.body).app_metadata;
    }
    return {
      ok: true,
      status: 200,
      json: async () => ({
        id: "user-123",
        created_at: new Date().toISOString(),
        app_metadata: { provider: "email" },
      }),
    };
  };

  try {
    await applyProfessionalReferral({
      supabaseUrl: "https://example.supabase.co",
      serviceRoleKey: "service-role-key",
      userId: "user-123",
      referral: { id: "referral-123", practiceName: "Example Family Law" },
    });
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(updatedMetadata, {
    provider: "email",
    meridian_professional_trial_days: 14,
    meridian_professional_referral_id: "referral-123",
    meridian_professional_referral_name: "Example Family Law",
  });
});
