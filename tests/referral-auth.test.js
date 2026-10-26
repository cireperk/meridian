import process from "node:process";
import assert from "node:assert/strict";
import test from "node:test";
import authHandler from "../api/auth.js";
import referralLinkHandler from "../api/referral-link.js";
import {
  createProfessionalReferralToken,
  verifyProfessionalReferralToken,
} from "../lib/professional-referrals.js";

function createResponse(body, status = 200) {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  };
}

function createApiResponse() {
  return {
    headers: {},
    statusCode: 200,
    body: null,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

test("referral link issuance requires the admin key and returns a verifiable signup link", async () => {
  const previousEnv = {
    PROFESSIONAL_REFERRAL_ADMIN_KEY: process.env.PROFESSIONAL_REFERRAL_ADMIN_KEY,
    PROFESSIONAL_REFERRAL_SIGNING_SECRET: process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET,
    PUBLIC_APP_URL: process.env.PUBLIC_APP_URL,
  };
  const adminKey = "meridian-referral-admin-key-that-is-long-enough";
  const signingSecret = "meridian-referral-test-secret-that-is-long-enough";
  process.env.PROFESSIONAL_REFERRAL_ADMIN_KEY = adminKey;
  process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET = signingSecret;
  process.env.PUBLIC_APP_URL = "https://www.mymeridianapp.com";

  try {
    const unauthorized = createApiResponse();
    await referralLinkHandler({ method: "POST", headers: {}, body: { practiceName: "Example Family Law" } }, unauthorized);
    assert.equal(unauthorized.statusCode, 401);

    const response = createApiResponse();
    await referralLinkHandler({
      method: "POST",
      headers: { authorization: `Bearer ${adminKey}` },
      body: { practiceName: "Example Family Law" },
    }, response);
    const link = new URL(response.body.url);

    assert.equal(response.statusCode, 200);
    assert.equal(link.pathname, "/signup");
    assert.equal(verifyProfessionalReferralToken(link.searchParams.get("ref"), signingSecret)?.practiceName, "Example Family Law");
  } finally {
    for (const [name, value] of Object.entries(previousEnv)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("signup applies a valid professional referral to trusted app metadata", async () => {
  const env = {
    VITE_SUPABASE_URL: process.env.VITE_SUPABASE_URL,
    SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
    PROFESSIONAL_REFERRAL_SIGNING_SECRET: process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET,
  };
  const originalFetch = globalThis.fetch;
  const referralSecret = "meridian-referral-test-secret-that-is-long-enough";
  const referralToken = createProfessionalReferralToken("Example Family Law", referralSecret);
  let signupBody;
  let appMetadata;

  process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET = referralSecret;
  globalThis.fetch = async (url, options = {}) => {
    if (url.endsWith("/auth/v1/token?grant_type=password")) return createResponse({}, 400);
    if (url.endsWith("/auth/v1/signup")) {
      signupBody = JSON.parse(options.body);
      return createResponse({
        user: { id: "user-123", email: "person@example.com", created_at: new Date().toISOString() },
        access_token: "user-access-token",
      });
    }
    if (url.endsWith("/auth/v1/admin/users/user-123") && options.method === "PUT") {
      appMetadata = JSON.parse(options.body).app_metadata;
      return createResponse({});
    }
    if (url.endsWith("/auth/v1/admin/users/user-123")) {
      return createResponse({
        id: "user-123",
        created_at: new Date().toISOString(),
        app_metadata: { provider: "email" },
      });
    }
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const response = createApiResponse();
    await authHandler({
      method: "POST",
      headers: {},
      body: {
        email: "person@example.com",
        password: "ExamplePassword1",
        intent: "signup",
        referral: referralToken,
      },
    }, response);

    assert.equal(response.statusCode, 200);
    assert.equal(response.body.isNew, true);
    assert.equal(signupBody.data.meridian_professional_referral_token, referralToken);
    assert.equal(appMetadata.meridian_professional_trial_days, 14);
    assert.equal(appMetadata.meridian_professional_referral_name, "Example Family Law");
  } finally {
    globalThis.fetch = originalFetch;
    for (const [name, value] of Object.entries(env)) {
      if (value === undefined) delete process.env[name];
      else process.env[name] = value;
    }
  }
});

test("signup rejects an invalid referral without creating an account", async () => {
  const originalUrl = process.env.VITE_SUPABASE_URL;
  const originalServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const originalSecret = process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET;
  const originalFetch = globalThis.fetch;
  let signupRequested = false;
  process.env.VITE_SUPABASE_URL = "https://example.supabase.co";
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
  process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET = "meridian-referral-test-secret-that-is-long-enough";
  globalThis.fetch = async (url) => {
    if (url.endsWith("/auth/v1/token?grant_type=password")) return createResponse({}, 400);
    if (url.endsWith("/auth/v1/signup")) signupRequested = true;
    throw new Error(`Unexpected request: ${url}`);
  };

  try {
    const response = createApiResponse();
    await authHandler({
      method: "POST",
      headers: {},
      body: {
        email: "person@example.com",
        password: "ExamplePassword1",
        intent: "signup",
        referral: "not-a-signed-referral",
      },
    }, response);

    assert.equal(response.statusCode, 400);
    assert.equal(signupRequested, false);
  } finally {
    globalThis.fetch = originalFetch;
    if (originalUrl === undefined) delete process.env.VITE_SUPABASE_URL;
    else process.env.VITE_SUPABASE_URL = originalUrl;
    if (originalServiceKey === undefined) delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    else process.env.SUPABASE_SERVICE_ROLE_KEY = originalServiceKey;
    if (originalSecret === undefined) delete process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET;
    else process.env.PROFESSIONAL_REFERRAL_SIGNING_SECRET = originalSecret;
  }
});
