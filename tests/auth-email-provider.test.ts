import assert from "node:assert/strict";
import test from "node:test";
import {
  AuthEmailProviderError,
  type AuthEmailMessage,
  type AuthSmtpTransportFactory,
  passwordResetEmailMessage,
  sendAuthEmailMessage,
  verificationEmailMessage,
} from "../lib/auth/email-provider-core.ts";

const baseMessage: AuthEmailMessage = {
  to: "controlled-test@example.com",
  subject: "Test authentication email",
  text: "Text body",
  html: "<p>HTML body</p>",
  idempotencyKey: "verify-test-idempotency-key",
};

type SmtpMessage = Parameters<
  ReturnType<AuthSmtpTransportFactory>["sendMail"]
>[0];

function unavailableSmtp(): ReturnType<AuthSmtpTransportFactory> {
  throw new Error("SMTP must not be selected");
}

test("Resend remains the default authentication email provider", async () => {
  const requests: Array<{ input: string; init?: RequestInit }> = [];
  const fetchMock = (async (input: string | URL | Request, init?: RequestInit) => {
    requests.push({ input: String(input), init });
    return new Response(null, { status: 200 });
  }) as typeof fetch;

  await sendAuthEmailMessage(
    baseMessage,
    {
      RESEND_API_KEY: "staging-resend-key",
      AUTH_EMAIL_FROM: "Calistheni Staging <accounts@example.com>",
    },
    { fetch: fetchMock, createSmtpTransport: unavailableSmtp }
  );

  const request = requests[0];
  assert.ok(request);
  assert.equal(request.input, "https://api.resend.com/emails");
  assert.equal(request.init?.method, "POST");
  assert.equal(
    new Headers(request.init?.headers).get("Idempotency-Key"),
    baseMessage.idempotencyKey
  );
  assert.deepEqual(JSON.parse(String(request.init?.body)), {
    from: "Calistheni Staging <accounts@example.com>",
    to: [baseMessage.to],
    subject: baseMessage.subject,
    text: baseMessage.text,
    html: baseMessage.html,
  });
});

test("explicit Brevo selection uses required STARTTLS and never calls Resend", async () => {
  const transportConfigurations: Array<Parameters<AuthSmtpTransportFactory>[0]> = [];
  const deliveredMessages: SmtpMessage[] = [];
  let fetchCalls = 0;
  const createSmtpTransport: AuthSmtpTransportFactory = (options) => {
    transportConfigurations.push(options);
    return {
      async sendMail(message) {
        deliveredMessages.push(message);
        return { accepted: [message.to] };
      },
    };
  };

  await sendAuthEmailMessage(
    baseMessage,
    {
      AUTH_EMAIL_PROVIDER: "brevo",
      AUTH_EMAIL_FROM: "Calistheni Staging <accounts@example.com>",
      BREVO_SMTP_HOST: "smtp-relay.brevo.com",
      BREVO_SMTP_PORT: "587",
      BREVO_SMTP_USERNAME: "staging-smtp-user",
      BREVO_SMTP_PASSWORD: "staging-smtp-password",
    },
    {
      fetch: (async () => {
        fetchCalls += 1;
        return new Response(null, { status: 500 });
      }) as typeof fetch,
      createSmtpTransport,
    }
  );

  assert.equal(fetchCalls, 0);
  const transportOptions = transportConfigurations[0];
  const deliveredMessage = deliveredMessages[0];
  assert.ok(transportOptions);
  assert.ok(deliveredMessage);
  assert.deepEqual(transportOptions, {
    host: "smtp-relay.brevo.com",
    port: 587,
    user: "staging-smtp-user",
    password: "staging-smtp-password",
    ssl: false,
    tls: {
      rejectUnauthorized: true,
      servername: "smtp-relay.brevo.com",
    },
    timeout: 10_000,
    authentication: ["PLAIN", "LOGIN"],
    logger: transportOptions.logger,
  });
  assert.equal(deliveredMessage?.from, "Calistheni Staging <accounts@example.com>");
  assert.equal(deliveredMessage?.to, baseMessage.to);
  assert.equal(
    deliveredMessage?.messageId,
    `<${baseMessage.idempotencyKey}@auth.calistheni.app>`
  );
});

test("Brevo port 465 uses implicit TLS with certificate validation", async () => {
  const transportConfigurations: Array<Parameters<AuthSmtpTransportFactory>[0]> = [];
  await sendAuthEmailMessage(
    baseMessage,
    {
      AUTH_EMAIL_PROVIDER: "brevo",
      AUTH_EMAIL_FROM: "accounts@example.com",
      BREVO_SMTP_HOST: "smtp-relay.brevo.com",
      BREVO_SMTP_PORT: "465",
      BREVO_SMTP_USERNAME: "staging-smtp-user",
      BREVO_SMTP_PASSWORD: "staging-smtp-password",
    },
    {
      fetch: (async () => new Response(null, { status: 500 })) as typeof fetch,
      createSmtpTransport: (options) => {
        transportConfigurations.push(options);
        return { async sendMail() {} };
      },
    }
  );
  const transportOptions = transportConfigurations[0];
  assert.ok(transportOptions);
  assert.deepEqual(transportOptions.ssl, {
    rejectUnauthorized: true,
    servername: "smtp-relay.brevo.com",
  });
  assert.equal(transportOptions.tls, false);
});

test("missing Brevo SMTP configuration fails without a Resend fallback", async () => {
  let fetchCalls = 0;
  let smtpCalls = 0;
  await assert.rejects(
    sendAuthEmailMessage(
      baseMessage,
      {
        AUTH_EMAIL_PROVIDER: "brevo",
        AUTH_EMAIL_FROM: "accounts@example.com",
        BREVO_SMTP_HOST: "smtp-relay.brevo.com",
        BREVO_SMTP_PORT: "587",
        BREVO_SMTP_USERNAME: "staging-smtp-user",
      },
      {
        fetch: (async () => {
          fetchCalls += 1;
          return new Response(null, { status: 200 });
        }) as typeof fetch,
        createSmtpTransport: () => {
          smtpCalls += 1;
          return { async sendMail() {} };
        },
      }
    ),
    (error: unknown) =>
      error instanceof AuthEmailProviderError &&
      error.name === "AuthEmailConfigurationError" &&
      error.retryable &&
      error.category === "PROVIDER_CONFIGURATION"
  );
  assert.equal(fetchCalls, 0);
  assert.equal(smtpCalls, 0);
});

test("unsupported provider selection fails without using either transport", async () => {
  let fetchCalls = 0;
  let smtpCalls = 0;
  await assert.rejects(
    async () =>
      sendAuthEmailMessage(
        baseMessage,
        {
          AUTH_EMAIL_PROVIDER: "smtp",
          RESEND_API_KEY: "unused",
          AUTH_EMAIL_FROM: "accounts@example.com",
        },
        {
          fetch: (async () => {
            fetchCalls += 1;
            return new Response(null, { status: 200 });
          }) as typeof fetch,
          createSmtpTransport: () => {
            smtpCalls += 1;
            return { async sendMail() {} };
          },
        }
      ),
    (error: unknown) =>
      error instanceof AuthEmailProviderError &&
      error.category === "PROVIDER_CONFIGURATION"
  );
  assert.equal(fetchCalls, 0);
  assert.equal(smtpCalls, 0);
});

test("SMTP failures retain safe retry classification", async () => {
  await assert.rejects(
    sendAuthEmailMessage(
      baseMessage,
      {
        AUTH_EMAIL_PROVIDER: "brevo",
        AUTH_EMAIL_FROM: "accounts@example.com",
        BREVO_SMTP_HOST: "smtp-relay.brevo.com",
        BREVO_SMTP_PORT: "587",
        BREVO_SMTP_USERNAME: "staging-smtp-user",
        BREVO_SMTP_PASSWORD: "staging-smtp-password",
      },
      {
        fetch: (async () => new Response(null, { status: 200 })) as typeof fetch,
        createSmtpTransport: () => ({
          async sendMail() {
            throw Object.assign(new Error("recipient rejected"), {
              code: 2,
              smtp: "550 5.1.1 recipient rejected",
            });
          },
        }),
      }
    ),
    (error: unknown) =>
      error instanceof AuthEmailProviderError &&
      !error.retryable &&
      error.category === "PROVIDER_PERMANENT" &&
      !error.message.includes("recipient")
  );
});

test("verification and reset messages use the explicit staging origin", () => {
  const stagingOrigin = "https://calistheni-staging.vercel.app";
  const verification = verificationEmailMessage(
    "controlled-test@example.com",
    "verification-token",
    stagingOrigin
  );
  const reset = passwordResetEmailMessage(
    "controlled-test@example.com",
    "reset-token",
    stagingOrigin
  );
  assert.match(
    verification.text,
    /https:\/\/calistheni-staging\.vercel\.app\/verify-email\?token=verification-token/
  );
  assert.match(
    reset.text,
    /https:\/\/calistheni-staging\.vercel\.app\/reset-password\?token=reset-token/
  );
  assert.doesNotMatch(verification.text, /https:\/\/calistheni\.app/);
  assert.doesNotMatch(reset.text, /https:\/\/calistheni\.app/);
});
