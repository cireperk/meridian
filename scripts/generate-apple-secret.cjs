#!/usr/bin/env node
/**
 * Generates an Apple client secret (JWT) for Sign In with Apple.
 *
 * Usage:
 *   node scripts/generate-apple-secret.js \
 *     --team-id YOUR_TEAM_ID \
 *     --key-id YOUR_KEY_ID \
 *     --service-id com.mymeridianapp.web.signin \
 *     --key-file /path/to/AuthKey_XXXX.p8
 */

const crypto = require("crypto");
const fs = require("fs");

const args = process.argv.slice(2);
function getArg(name) {
  const idx = args.indexOf(`--${name}`);
  return idx !== -1 ? args[idx + 1] : null;
}

const teamId = getArg("team-id");
const keyId = getArg("key-id");
const serviceId = getArg("service-id") || "com.mymeridianapp.web.signin";
const keyFile = getArg("key-file");

if (!teamId || !keyId || !keyFile) {
  console.error("Usage: node generate-apple-secret.js --team-id TEAM_ID --key-id KEY_ID --key-file /path/to/key.p8 [--service-id SERVICE_ID]");
  process.exit(1);
}

const privateKey = fs.readFileSync(keyFile, "utf8");

// JWT header
const header = {
  alg: "ES256",
  kid: keyId,
  typ: "JWT"
};

// JWT payload — expires in 180 days (Apple max)
const now = Math.floor(Date.now() / 1000);
const payload = {
  iss: teamId,
  iat: now,
  exp: now + (180 * 24 * 60 * 60), // 6 months
  aud: "https://appleid.apple.com",
  sub: serviceId
};

function base64url(obj) {
  return Buffer.from(JSON.stringify(obj))
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

const headerB64 = base64url(header);
const payloadB64 = base64url(payload);
const signingInput = `${headerB64}.${payloadB64}`;

const sign = crypto.createSign("SHA256");
sign.update(signingInput);
const sig = sign.sign(privateKey);

// Convert DER signature to raw r||s format for ES256
function derToRaw(derSig) {
  const seq = derSig;
  let offset = 2;
  if (seq[1] & 0x80) offset += (seq[1] & 0x7f);

  // Parse r
  offset++; // 0x02 tag
  let rLen = seq[offset++];
  let r = seq.slice(offset, offset + rLen);
  offset += rLen;

  // Parse s
  offset++; // 0x02 tag
  let sLen = seq[offset++];
  let s = seq.slice(offset, offset + sLen);

  // Pad/trim to 32 bytes each
  if (r.length > 32) r = r.slice(r.length - 32);
  if (s.length > 32) s = s.slice(s.length - 32);
  const rawR = Buffer.alloc(32);
  const rawS = Buffer.alloc(32);
  r.copy(rawR, 32 - r.length);
  s.copy(rawS, 32 - s.length);

  return Buffer.concat([rawR, rawS]);
}

const rawSig = derToRaw(sig);
const sigB64 = rawSig.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");

const jwt = `${signingInput}.${sigB64}`;

console.log("\n=== Apple Client Secret (JWT) ===\n");
console.log(jwt);
console.log("\nExpires:", new Date((now + 180 * 24 * 60 * 60) * 1000).toISOString().split("T")[0]);
console.log("\nPaste this into Supabase → Authentication → Apple → Secret Key (for OAuth)\n");
