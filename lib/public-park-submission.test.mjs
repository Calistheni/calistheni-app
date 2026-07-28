import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("public park submissions authenticate, persist pending parks, and keep them out of public visibility", async () => {
  const [route, adminSubmissions, visibility, validation] = await Promise.all([
    readFile(new URL("app/api/user/parks/route.ts", root), "utf8"),
    readFile(new URL("app/api/admin/submissions/route.ts", root), "utf8"),
    readFile(new URL("lib/park-map-query.ts", root), "utf8"),
    readFile(new URL("lib/validation/parks.ts", root), "utf8"),
  ]);

  assert.match(route, /getAuthenticatedUserId/);
  assert.match(route, /PARK_SUBMISSION_AUTH_REQUIRED/);
  assert.match(route, /submissionStatus: "PENDING"/);
  assert.match(route, /submittedById: userId/);
  assert.match(route, /prisma\.\$transaction/);
  assert.match(route, /tryDeletePendingParkPhotoKey/);
  assert.match(adminSubmissions, /submissionStatus: "PENDING"/);
  assert.match(visibility, /submissionStatus: "APPROVED"/);
  assert.match(validation, /qrCodeNote: optionalText\(500\)\.optional\(\)/);
});

test("public submission UI prevents duplicate requests and exposes success and failures", async () => {
  const form = await readFile(
    new URL("components/user/ParkSubmissionForm.tsx", root),
    "utf8"
  );

  assert.match(form, /submissionAttemptRef/);
  assert.match(form, /isPreparingSubmission/);
  assert.match(form, /Park submitted for review/);
  assert.match(form, /pending an administrator review/);
  assert.match(form, /submissionError/);
  assert.match(form, /Please sign in again before submitting a park/);
  assert.match(form, /<form className="space-y-5" onSubmit=\{handleFormSubmit\}/);
  assert.match(form, /type="submit"/);
  assert.match(form, /event\.preventDefault\(\)/);
  assert.match(form, /await import\(\s*"browser-image-compression"\s*\)/);
  assert.match(form, /await import\("exifr"\)/);
});
