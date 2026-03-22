import "server-only";

type SendEmailOptions = {
  to: string;
  subject: string;
  text: string;
  html?: string;
  replyTo?: string;
};

type EmailConfigurationStatus = {
  configured: boolean;
  missingKeys: string[];
  transport: "cloudflare" | "smtp";
};

let transporterPromise: Promise<import("nodemailer").Transporter> | null = null;

const MAILCHANNELS_API_URL = "https://api.mailchannels.net/tx/v1/send";

const readEnv = (key: string) => String(process.env[key] ?? "").trim();

const isCloudflareWorkerRuntime = () => {
  const navigatorUserAgent =
    typeof navigator !== "undefined" ? String(navigator.userAgent ?? "").trim() : "";
  const workerdVersion =
    typeof process !== "undefined" ? String(process.versions?.workerd ?? "").trim() : "";

  return navigatorUserAgent === "Cloudflare-Workers" || workerdVersion.length > 0;
};

const parseSmtpPort = (rawValue: string) => {
  const value = Number(rawValue);
  if (!Number.isInteger(value) || value <= 0 || value > 65535) {
    throw new Error("SMTP_PORT must be a valid TCP port number.");
  }

  return value;
};

const parseSmtpSecure = (rawValue: string, port: number) => {
  const normalized = rawValue.toLowerCase();

  if (!normalized) {
    return port === 465;
  }

  if (["1", "true", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["0", "false", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error("SMTP_SECURE must be true/false.");
};

export const getEmailConfigurationStatus = (): EmailConfigurationStatus => {
  const requiredKeys = isCloudflareWorkerRuntime()
    ? ["SMTP_FROM_EMAIL"]
    : ["SMTP_HOST", "SMTP_PORT", "SMTP_USER", "SMTP_PASS", "SMTP_FROM_EMAIL"];
  const missingKeys = requiredKeys.filter((key) => readEnv(key).length === 0);

  return {
    configured: missingKeys.length === 0,
    missingKeys,
    transport: isCloudflareWorkerRuntime() ? "cloudflare" : "smtp",
  };
};

export const assertEmailConfiguration = () => {
  const status = getEmailConfigurationStatus();
  if (!status.configured) {
    throw new Error(
      `Email ${status.transport} transport is not configured. Missing environment variables: ${status.missingKeys.join(", ")}.`
    );
  }

  return status;
};

const sendViaCloudflare = async ({ to, subject, text, html, replyTo }: SendEmailOptions) => {
  const status = assertEmailConfiguration();
  if (status.transport !== "cloudflare") {
    throw new Error("Cloudflare email transport requested outside the Cloudflare runtime.");
  }

  const fromEmail = readEnv("SMTP_FROM_EMAIL");
  const fromName = readEnv("SMTP_FROM_NAME") || "In-Accord";
  const content = [
    {
      type: "text/plain",
      value: text,
    },
    ...(html
      ? [
          {
            type: "text/html",
            value: html,
          },
        ]
      : []),
  ];

  const response = await fetch(MAILCHANNELS_API_URL, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      personalizations: [
        {
          to: [{ email: to }],
        },
      ],
      from: {
        email: fromEmail,
        name: fromName,
      },
      ...(replyTo
        ? {
            reply_to: {
              email: replyTo,
            },
          }
        : {}),
      subject,
      content,
    }),
  });

  if (response.ok) {
    return;
  }

  const errorBody = await response.text().catch(() => "");
  const errorDetail = errorBody.trim();
  throw new Error(
    errorDetail.length > 0
      ? `Cloudflare email passthrough failed (${response.status}): ${errorDetail}`
      : `Cloudflare email passthrough failed with status ${response.status}.`
  );
};

const getTransporter = async () => {
  if (transporterPromise) {
    return transporterPromise;
  }

  transporterPromise = (async () => {
    assertEmailConfiguration();

    const smtpHost = readEnv("SMTP_HOST");
    const smtpPort = parseSmtpPort(readEnv("SMTP_PORT"));
    const smtpSecure = parseSmtpSecure(readEnv("SMTP_SECURE"), smtpPort);
    const smtpUser = readEnv("SMTP_USER");
    const smtpPass = readEnv("SMTP_PASS");

    const nodemailerModule = await import("nodemailer");
    return nodemailerModule.createTransport({
      host: smtpHost,
      port: smtpPort,
      secure: smtpSecure,
      auth: {
        user: smtpUser,
        pass: smtpPass,
      },
    });
  })().catch((error) => {
    transporterPromise = null;
    throw error;
  });

  return transporterPromise;
};

export const sendEmail = async ({ to, subject, text, html, replyTo }: SendEmailOptions) => {
  if (isCloudflareWorkerRuntime()) {
    await sendViaCloudflare({ to, subject, text, html, replyTo });
    return;
  }

  const transporter = await getTransporter();
  const fromEmail = readEnv("SMTP_FROM_EMAIL");
  const fromName = readEnv("SMTP_FROM_NAME") || "In-Accord";

  await transporter.sendMail({
    from: {
      address: fromEmail,
      name: fromName,
    },
    to,
    subject,
    text,
    ...(html ? { html } : {}),
    ...(replyTo ? { replyTo } : {}),
  });
};