import test from "node:test";
import assert from "node:assert/strict";
import { readApiError } from "../src/lib/readApiError";

test("readApiError extracts nested { code, message } objects", () => {
  assert.equal(
    readApiError({ error: { code: "AUTH_REQUIRED", message: "Authentication required." } }, "fallback"),
    "Authentication required.",
  );
});

test("readApiError returns string error payloads as-is", () => {
  assert.equal(readApiError({ error: "Checkout failed." }, "fallback"), "Checkout failed.");
});

test("readApiError uses top-level message when error is absent", () => {
  assert.equal(readApiError({ ok: false, code: "WALLET_NOT_VERIFIED", message: "No verified wallet on this session." }, "fallback"), "No verified wallet on this session.");
});

test("readApiError uses fallback when error is missing or non-string", () => {
  assert.equal(readApiError({}, "Failed to create stripe checkout session."), "Failed to create stripe checkout session.");
  assert.equal(readApiError({ error: { code: "AUTH_REQUIRED" } }, "fallback"), "fallback");
  assert.equal(readApiError(null, "fallback"), "fallback");
  assert.equal(readApiError(undefined, "fallback"), "fallback");
});

test("unauthenticated checkout payload cannot be stored as a React child object", () => {
  const resOk = false;
  const data: unknown = { error: { code: "AUTH_REQUIRED", message: "Authentication required." } };
  const checkoutUrl =
    data && typeof data === "object" && "url" in data && typeof (data as { url?: unknown }).url === "string"
      ? (data as { url: string }).url
      : null;
  const error =
    !resOk || !checkoutUrl
      ? readApiError(data, "Failed to create stripe checkout session.")
      : null;
  assert.equal(typeof error, "string");
  assert.equal(error, "Authentication required.");
});

test("readApiError never returns a non-string", () => {
  const samples: unknown[] = [
    { error: { code: "AUTH_REQUIRED", message: "Authentication required." } },
    { error: "plain" },
    { error: { code: "X" } },
    { error: 31 },
    {},
    null,
  ];
  for (const sample of samples) {
    const result = readApiError(sample, "fallback");
    assert.equal(typeof result, "string");
    assert.notEqual(result, "[object Object]");
  }
});
