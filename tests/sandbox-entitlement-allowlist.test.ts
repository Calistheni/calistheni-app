import assert from "node:assert/strict";
import test from "node:test";
import { isCanonicalUserIdAllowlisted } from "../lib/sandbox-entitlement-allowlist.ts";

test("sandbox review allowlist requires an exact canonical user ID", () => {
  assert.equal(isCanonicalUserIdAllowlisted("user-1", undefined), false);
  assert.equal(isCanonicalUserIdAllowlisted("user-1", ""), false);
  assert.equal(isCanonicalUserIdAllowlisted("user-1", "user-10,user-2"), false);
  assert.equal(isCanonicalUserIdAllowlisted("user-1", " reviewer@calistheni.app "), false);
  assert.equal(isCanonicalUserIdAllowlisted("user-1", "user-2, user-1"), true);
});
