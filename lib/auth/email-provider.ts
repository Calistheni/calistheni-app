import "server-only";

import { SMTPClient } from "emailjs";
import { getSiteUrl } from "@/lib/site-url";
import {
  AuthEmailProviderError,
  passwordResetEmailMessage,
  sendAuthEmailMessage,
  verificationEmailMessage,
} from "@/lib/auth/email-provider-core";

export { AuthEmailProviderError };

function send(message: ReturnType<typeof verificationEmailMessage>) {
  return sendAuthEmailMessage(message, process.env, {
    fetch,
    createSmtpTransport: (options) => {
      const client = new SMTPClient(options);
      return {
        async sendMail(authMessage) {
          try {
            await client.sendAsync({
              from: authMessage.from,
              to: authMessage.to,
              subject: authMessage.subject,
              text: authMessage.text,
              "message-id": authMessage.messageId,
              attachment: [
                {
                  data: authMessage.html,
                  alternative: true,
                  type: "text/html",
                },
              ],
            });
          } finally {
            client.smtp.close(true);
          }
        },
      };
    },
  });
}

export function sendVerificationEmail(email: string, token: string) {
  return send(verificationEmailMessage(email, token, getSiteUrl()));
}

export function sendPasswordResetEmail(email: string, token: string) {
  return send(passwordResetEmailMessage(email, token, getSiteUrl()));
}
