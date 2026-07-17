import assert from "node:assert/strict";
import test from "node:test";
import {
  buildPartnerInquiryEmailContent,
  escapeHtml,
} from "./partner-inquiry-email-content.ts";

test("partner inquiry HTML escapes submitted content", () => {
  assert.equal(
    escapeHtml('<script>alert("x")</script>'),
    "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;"
  );

  const content = buildPartnerInquiryEmailContent({
    inquiryId: 42,
    businessName: "Movement <Lab>",
    contactName: "Alex & Morgan",
    email: "alex@example.com",
    website: "https://example.com/?a=1&b=2",
    proposedReward: "A pass\nwith <conditions>",
    submittedAt: "2026-07-17T10:00:00.000Z",
  });

  assert.match(content.html, /Movement &lt;Lab&gt;/);
  assert.match(content.html, /Alex &amp; Morgan/);
  assert.match(content.html, /A pass<br \/>with &lt;conditions&gt;/);
  assert.doesNotMatch(content.html, /<conditions>/);
  assert.match(content.text, /Reward or partnership idea:\nA pass/);
  assert.match(content.subject, /Movement <Lab>/);
});
