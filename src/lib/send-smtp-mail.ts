import nodemailer from "nodemailer";

export type SmtpMailPayload = {
  from: string;
  to: string;
  subject: string;
  html: string;
};

function requireSmtpEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in environment.`);
  }
  return value;
}

export function getSmtpConfig() {
  return {
    host: process.env.SMTP_HOST?.trim() || "smtp.office365.com",
    port: Number(process.env.SMTP_PORT?.trim() || "587") || 587,
    user: requireSmtpEnv("SMTP_USER"),
    pass: requireSmtpEnv("SMTP_PASS"),
  };
}

export async function sendSmtpMail(payload: SmtpMailPayload): Promise<void> {
  const to = payload.to
    .split(/[,;]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  if (to.length === 0) {
    throw new Error("Add at least one To email address.");
  }
  if (!payload.subject.trim()) {
    throw new Error("Subject is required.");
  }
  if (!payload.from.trim()) {
    throw new Error("From is required.");
  }

  const smtp = getSmtpConfig();
  const transporter = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: {
      user: smtp.user,
      pass: smtp.pass,
    },
  });

  await transporter.sendMail({
    from: payload.from.trim(),
    to: to.join(", "),
    subject: payload.subject.trim(),
    html: payload.html,
  });
}
