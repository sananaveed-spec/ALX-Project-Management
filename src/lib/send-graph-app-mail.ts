/**
 * Unattended Graph send (client credentials / app-only).
 * Requires Application permission Mail.Send + admin consent,
 * and AZURE_CLIENT_ID / AZURE_TENANT_ID / AZURE_CLIENT_SECRET.
 */

export type GraphAppMailPayload = {
  /** Mailbox UPN that appears as From (e.g. sana.naveed@allumiax.com). */
  from: string;
  to: string;
  subject: string;
  html: string;
};

function requireEnv(name: string, fallback?: string): string {
  const value = process.env[name]?.trim() || fallback?.trim() || "";
  if (!value) {
    throw new Error(`Missing ${name} in environment.`);
  }
  return value;
}

function parseEmailList(value: string): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of value.split(/[,;]+/)) {
    const email = part.trim();
    if (!email || !email.includes("@")) {
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    emails.push(email);
  }
  return emails;
}

function toRecipientList(emails: string[]) {
  return emails.map((address) => ({
    emailAddress: { address },
  }));
}

export function getGraphAppMailConfig() {
  const clientId = requireEnv(
    "AZURE_CLIENT_ID",
    process.env.NEXT_PUBLIC_AZURE_CLIENT_ID,
  );
  const tenantId = requireEnv(
    "AZURE_TENANT_ID",
    process.env.NEXT_PUBLIC_AZURE_TENANT_ID,
  );
  const clientSecret = requireEnv("AZURE_CLIENT_SECRET");
  return { clientId, tenantId, clientSecret };
}

async function acquireAppAccessToken(): Promise<string> {
  const { clientId, tenantId, clientSecret } = getGraphAppMailConfig();
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    scope: "https://graph.microsoft.com/.default",
    grant_type: "client_credentials",
  });

  const response = await fetch(
    `https://login.microsoftonline.com/${tenantId}/oauth2/v2.0/token`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  const data = (await response.json()) as {
    access_token?: string;
    error?: string;
    error_description?: string;
  };

  if (!response.ok || !data.access_token) {
    throw new Error(
      data.error_description ||
        data.error ||
        `Failed to get Graph app token (${response.status}).`,
    );
  }

  return data.access_token;
}

/**
 * Send mail as a specific user mailbox via Graph application permissions.
 */
export async function sendGraphAppMail(
  payload: GraphAppMailPayload,
): Promise<void> {
  const from = payload.from.trim();
  const to = parseEmailList(payload.to);
  if (!from) {
    throw new Error("From mailbox is required.");
  }
  if (to.length === 0) {
    throw new Error("Add at least one To email address.");
  }
  if (!payload.subject.trim()) {
    throw new Error("Subject is required.");
  }

  const token = await acquireAppAccessToken();
  const userPath = `/users/${encodeURIComponent(from)}`;
  const response = await fetch(
    `https://graph.microsoft.com/v1.0${userPath}/sendMail`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        message: {
          subject: payload.subject.trim(),
          body: {
            contentType: "HTML",
            content: payload.html,
          },
          toRecipients: toRecipientList(to),
        },
        saveToSentItems: true,
      }),
    },
  );

  if (!response.ok) {
    let detail = "";
    try {
      const data = (await response.json()) as {
        error?: { message?: string; code?: string };
      };
      detail = data.error?.message?.trim() || data.error?.code || "";
    } catch {
      detail = "";
    }
    throw new Error(
      detail ||
        `Graph sendMail failed (${response.status}). Confirm Application Mail.Send + admin consent, and that the app may send as ${from}.`,
    );
  }
}
