import assert from "node:assert/strict";
import test from "node:test";
import {
  PARTNER_CATEGORIES,
  partnerInquirySchema,
} from "./partner-inquiries.ts";

const validInquiry = {
  businessName: "Movement Lab",
  contactName: "Alex Morgan",
  email: "alex@example.com",
  website: "https://example.com",
  category: PARTNER_CATEGORIES[1],
  cityCountry: "Sofia, Bulgaria",
  proposedReward: "A gym day pass for qualifying members.",
  message: "",
  companyFax: "",
  startedAt: Date.now() - 10_000,
};

test("partner inquiry validation accepts a complete request", () => {
  const result = partnerInquirySchema.safeParse(validInquiry);

  assert.equal(result.success, true);
  assert.equal(result.data?.message, null);
});

test("partner inquiry validation accepts the simplified form", () => {
  const { category, cityCountry, ...simplifiedInquiry } = validInquiry;
  void category;
  void cityCountry;

  const result = partnerInquirySchema.safeParse(simplifiedInquiry);

  assert.equal(result.success, true);
  assert.equal(result.data?.category, "");
  assert.equal(result.data?.cityCountry, "");
});

test("partner inquiry validation rejects invalid contact details", () => {
  const result = partnerInquirySchema.safeParse({
    ...validInquiry,
    email: "not-an-email",
    category: "Unknown category",
  });

  assert.equal(result.success, false);
});

test("partner inquiry validation rejects a filled honeypot", () => {
  const result = partnerInquirySchema.safeParse({
    ...validInquiry,
    companyFax: "automated value",
  });

  assert.equal(result.success, false);
});
