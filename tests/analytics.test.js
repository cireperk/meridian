import assert from "node:assert/strict";
import test from "node:test";
import analyticsHandler from "../api/analytics.js";

function createApiResponse() {
  return {
    headers: {},
    statusCode: 200,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(statusCode) {
      this.statusCode = statusCode;
      return this;
    },
    end() {
      this.ended = true;
      return this;
    },
  };
}

test("analytics accepts only allowlisted events from the same origin", async () => {
  const response = createApiResponse();
  const originalInfo = console.info;
  console.info = () => {};
  try {
    await analyticsHandler({
      method: "POST",
      headers: { origin: "https://www.mymeridianapp.com", host: "www.mymeridianapp.com" },
      body: { event: "guide_search" },
    }, response);
  } finally {
    console.info = originalInfo;
  }

  assert.equal(response.statusCode, 204);
  assert.equal(response.headers["Cache-Control"], "no-store");
  assert.equal(response.ended, true);
});

test("analytics rejects unrecognized events and cross-origin requests", async () => {
  const invalidEvent = createApiResponse();
  await analyticsHandler({
    method: "POST",
    headers: { origin: "https://www.mymeridianapp.com", host: "www.mymeridianapp.com" },
    body: { event: "signup person@example.com" },
  }, invalidEvent);

  const crossOrigin = createApiResponse();
  await analyticsHandler({
    method: "POST",
    headers: { origin: "https://attacker.example", host: "www.mymeridianapp.com" },
    body: { event: "guide_search" },
  }, crossOrigin);

  assert.equal(invalidEvent.statusCode, 400);
  assert.equal(crossOrigin.statusCode, 403);
});
