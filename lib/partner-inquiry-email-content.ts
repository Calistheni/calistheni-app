export type PartnerInquiryEmailContentInput = {
  inquiryId: number;
  businessName: string;
  contactName: string;
  email: string;
  website: string;
  proposedReward: string;
  submittedAt: Date | string;
};

export function escapeHtml(value: string) {
  return value.replace(
    /[&<>"']/g,
    (character) =>
      ({
        "&": "&amp;",
        "<": "&lt;",
        ">": "&gt;",
        '"': "&quot;",
        "'": "&#39;",
      })[character] ?? character
  );
}

function htmlValue(value: string) {
  return escapeHtml(value).replace(/\r?\n/g, "<br />");
}

function formatSubmittedAt(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  return date.toISOString();
}

export function buildPartnerInquiryEmailContent(
  input: PartnerInquiryEmailContentInput
) {
  const submittedAt = formatSubmittedAt(input.submittedAt);
  const subjectBusinessName = input.businessName.replace(/[\r\n]+/g, " ");
  const rows = [
    ["Contact name", input.contactName],
    ["Business or brand", input.businessName],
    ["Email", input.email],
    ["Website or Instagram", input.website],
    ["Reward or partnership idea", input.proposedReward],
    ["Submitted at", submittedAt],
  ] as const;
  const htmlRows = rows
    .map(
      ([label, value]) => `
        <tr>
          <th style="padding:10px 16px 10px 0;text-align:left;vertical-align:top;color:#71717a;font-size:13px;font-weight:600;white-space:nowrap;">${escapeHtml(label)}</th>
          <td style="padding:10px 0;color:#18181b;font-size:14px;line-height:1.6;overflow-wrap:anywhere;">${htmlValue(value)}</td>
        </tr>`
    )
    .join("");
  const text = [
    `New Calistheni partner inquiry — ${subjectBusinessName}`,
    "",
    ...rows.flatMap(([label, value]) => [`${label}:`, value, ""]),
    `Inquiry ID: ${input.inquiryId}`,
  ].join("\n");

  return {
    subject: `New Calistheni partner inquiry — ${subjectBusinessName}`,
    text,
    html: `<!doctype html>
<html lang="en">
  <body style="margin:0;padding:24px;background:#f4f4f5;font-family:Arial,sans-serif;">
    <div style="max-width:680px;margin:0 auto;border:1px solid #e4e4e7;border-radius:16px;background:#ffffff;padding:28px;">
      <p style="margin:0;color:#2563eb;font-size:12px;font-weight:700;letter-spacing:0.12em;text-transform:uppercase;">Calistheni partners</p>
      <h1 style="margin:10px 0 8px;color:#18181b;font-size:24px;line-height:1.25;">New partner inquiry</h1>
      <p style="margin:0 0 20px;color:#71717a;font-size:14px;">A visitor submitted the public partner-interest form.</p>
      <table role="presentation" style="width:100%;border-collapse:collapse;border-top:1px solid #e4e4e7;border-bottom:1px solid #e4e4e7;">
        ${htmlRows}
      </table>
      <p style="margin:20px 0 0;color:#a1a1aa;font-size:12px;">Inquiry ID: ${input.inquiryId}</p>
    </div>
  </body>
</html>`,
  };
}
