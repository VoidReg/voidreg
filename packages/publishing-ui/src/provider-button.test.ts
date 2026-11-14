import assert from "node:assert/strict";
import test from "node:test";
import { isSignInProvider, providerButtonLabel } from "./provider-button.ts";

test("sign-in and connect use the approved provider labels", () => {
  assert.equal(providerButtonLabel("google", "signin"), "Sign in with Google");
  assert.equal(providerButtonLabel("github", "signin"), "Sign in with GitHub");
  assert.equal(
    providerButtonLabel("google", "continue"),
    "Continue with Google",
  );
  assert.equal(
    providerButtonLabel("github", "continue"),
    "Continue with GitHub",
  );
  assert.equal(isSignInProvider("google"), true);
  assert.equal(isSignInProvider("github"), true);
  assert.equal(isSignInProvider("password"), false);
});
