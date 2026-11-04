import type {
  AccountInfo,
  IPublicClientApplication,
} from "@azure/msal-browser";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { mailSendRequest } from "@/auth/authConfig";

export type GraphMailPayload = {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  /**
   * When set (must be in the future), Outlook holds the message until this
   * time via PidTagDeferredSendTime (SystemTime 0x3FEF).
   */
  sendAt?: Date;
};

function parseEmailList(value: string): string[] {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of value.split(/[,;]+/)) {
    const email = part.trim();
    if (!email) {
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

async function acquireMailToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<string> {
  try {
    const result = await instance.acquireTokenSilent({
      ...mailSendRequest,
      account,
    });
    return result.accessToken;
  } catch (error) {
    if (error instanceof InteractionRequiredAuthError) {
      const result = await instance.acquireTokenPopup({
        ...mailSendRequest,
        account,
      });
      return result.accessToken;
    }
    throw error;
  }
}

export async function sendGraphMail(
  instance: IPublicClientApplication,
  account: AccountInfo,
  payload: GraphMailPayload,
): Promise<void> {
  const to = parseEmailList(payload.to);
  if (to.length === 0) {
    throw new Error("Add at least one To email address.");
  }
  if (!payload.subject.trim()) {
    throw new Error("Subject is required.");
  }

  const sendAt = payload.sendAt;
  if (sendAt) {
    const soonest = Date.now() + 60_000;
    if (sendAt.getTime() < soonest) {
      throw new Error(
        "Choose a send time at least one minute in the future, or use Send Now.",
      );
    }
  }

  const token = await acquireMailToken(instance, account);
  const message: Record<string, unknown> = {
    subject: payload.subject.trim(),
    body: {
      contentType: "HTML",
      content: payload.html,
    },
    toRecipients: toRecipientList(to),
    ccRecipients: toRecipientList(parseEmailList(payload.cc ?? "")),
    bccRecipients: toRecipientList(parseEmailList(payload.bcc ?? "")),
  };

  if (sendAt) {
    message.singleValueExtendedProperties = [
      {
        id: "SystemTime 0x3FEF",
        value: sendAt.toISOString(),
      },
    ];
  }

  const response = await fetch("https://graph.microsoft.com/v1.0/me/sendMail", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      message,
      saveToSentItems: true,
    }),
  });

  if (!response.ok) {
    let detail = "";
    try {
      const data = (await response.json()) as {
        error?: { message?: string; code?: string };
      };
      detail = data.error?.message?.trim() || "";
    } catch {
      detail = "";
    }
    throw new Error(friendlyGraphMailError(detail, response.status));
  }
}

function friendlyGraphMailError(detail: string, status: number): string {
  const lower = detail.toLowerCase();
  if (
    lower.includes("consent") ||
    lower.includes("access denied") ||
    status === 403
  ) {
    return (
      detail ||
      "Mail permission was denied. Ask an admin to grant Mail.Send for this app, then sign out and sign in again."
    );
  }
  if (lower.includes("mailboxnotenabledforrestapi") || status === 404) {
    return (
      "No cloud mailbox was found for your signed-in account. " +
      "Use a Microsoft 365 mailbox with Exchange Online."
    );
  }
  return detail || `Failed to send email (${status}).`;
}
