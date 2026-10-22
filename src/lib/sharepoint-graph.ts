import type {
  AccountInfo,
  IPublicClientApplication,
} from "@azure/msal-browser";
import { InteractionRequiredAuthError } from "@azure/msal-browser";
import { sharePointRequest } from "@/auth/authConfig";

const GRAPH = "https://graph.microsoft.com/v1.0";

export function sharePointSiteHost(): string {
  return (
    process.env.NEXT_PUBLIC_SHAREPOINT_SITE_HOST?.trim() ||
    "allumiax.sharepoint.com"
  );
}

export function sharePointSitePath(): string {
  const raw =
    process.env.NEXT_PUBLIC_SHAREPOINT_SITE_PATH?.trim() || "/sites/EngProj";
  return raw.startsWith("/") ? raw : `/${raw}`;
}

export function sharePointSiteId(): string {
  return process.env.NEXT_PUBLIC_SHAREPOINT_SITE_ID?.trim() || "";
}

export function isSharePointConfigured(): boolean {
  return Boolean(sharePointSiteId() || (sharePointSiteHost() && sharePointSitePath()));
}

/** Folder-safe SharePoint name (strip illegal characters). */
export function sanitizeSharePointFolderName(raw: string): string {
  return raw
    .replace(/["*:<>?/\\|#%]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "")
    .slice(0, 200);
}

/** Local date as yymmdd, e.g. 261021. */
export function formatSharePointDateStamp(date = new Date()): string {
  const yy = String(date.getFullYear()).slice(-2);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yy}${mm}${dd}`;
}

/** Main folder: `{yymmdd} - {Project Name} - {UniqueID}` */
export function buildProjectSharePointFolderName(input: {
  projectName: string;
  uniqueId: string;
  date?: Date;
}): string {
  const stamp = formatSharePointDateStamp(input.date);
  const projectName = sanitizeSharePointFolderName(input.projectName) || "Project";
  const uniqueId = sanitizeSharePointFolderName(input.uniqueId) || "ID";
  return sanitizeSharePointFolderName(`${stamp} - ${projectName} - ${uniqueId}`);
}

function sharePointAuthErrorMessage(error: unknown): string {
  const code =
    error && typeof error === "object" && "errorCode" in error
      ? String((error as { errorCode?: string }).errorCode ?? "")
      : "";
  const message =
    error instanceof Error ? error.message : "SharePoint sign-in failed.";

  if (/interaction_in_progress/i.test(code) || /interaction_in_progress/i.test(message)) {
    return (
      "A Microsoft sign-in popup is already open. Finish or close that popup, " +
      "wait a second, then try Create on SharePoint again (do not click Save while the popup is open)."
    );
  }
  if (/timed_out|monitor_window_timeout/i.test(code) || /timed_out/i.test(message)) {
    return (
      "SharePoint sign-in timed out. Allow popups for this site, then check " +
      "Create on SharePoint again (or Sign out and Sign in). Also confirm Azure " +
      "admin consent for Sites.Read.All + Files.ReadWrite.All."
    );
  }
  if (/popup_window_error|empty_window_error/i.test(code)) {
    return (
      "SharePoint popup was blocked. Allow popups for localhost / this site, then try again."
    );
  }
  if (/user_cancelled|access_denied/i.test(code)) {
    return "SharePoint permission was cancelled. Check Create on SharePoint and approve when prompted.";
  }
  if (/consent_required|interaction_required|login_required/i.test(code)) {
    return (
      "SharePoint needs permission. An admin must grant Sites.Read.All + " +
      "Files.ReadWrite.All on the Azure app, then Sign out and Sign in."
    );
  }
  return message;
}

/** One interactive SharePoint login at a time (avoids interaction_in_progress). */
let sharePointTokenInFlight: Promise<string> | null = null;

async function acquireSharePointToken(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<string> {
  if (sharePointTokenInFlight) {
    return sharePointTokenInFlight;
  }

  sharePointTokenInFlight = (async () => {
    try {
      try {
        const result = await instance.acquireTokenSilent({
          ...sharePointRequest,
          account,
        });
        return result.accessToken;
      } catch (silentError) {
        try {
          const result = await instance.acquireTokenPopup({
            ...sharePointRequest,
            account,
          });
          return result.accessToken;
        } catch (popupError) {
          // If another MSAL interaction is stuck, wait briefly and retry silent once.
          const code =
            popupError &&
            typeof popupError === "object" &&
            "errorCode" in popupError
              ? String((popupError as { errorCode?: string }).errorCode ?? "")
              : "";
          if (/interaction_in_progress/i.test(code)) {
            await new Promise((resolve) => window.setTimeout(resolve, 1500));
            try {
              const retry = await instance.acquireTokenSilent({
                ...sharePointRequest,
                account,
              });
              return retry.accessToken;
            } catch {
              throw new Error(sharePointAuthErrorMessage(popupError));
            }
          }
          throw new Error(sharePointAuthErrorMessage(popupError));
        }
      }
    } finally {
      sharePointTokenInFlight = null;
    }
  })();

  return sharePointTokenInFlight;
}

/** Call when user checks Create on SharePoint — consent before Save. */
export async function ensureSharePointAccess(
  instance: IPublicClientApplication,
  account: AccountInfo,
): Promise<void> {
  await acquireSharePointToken(instance, account);
}

async function graphJson<T>(
  accessToken: string,
  url: string,
  init?: RequestInit,
): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: "application/json",
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => ({}))) as T & {
    error?: { message?: string; code?: string };
  };
  if (!response.ok) {
    throw new Error(
      payload.error?.message ||
        `SharePoint Graph request failed (${response.status}).`,
    );
  }
  return payload;
}

async function resolveSiteId(accessToken: string): Promise<string> {
  const configured = sharePointSiteId();
  if (configured) {
    return configured;
  }
  const host = sharePointSiteHost();
  const path = sharePointSitePath();
  const site = await graphJson<{ id?: string }>(
    accessToken,
    `${GRAPH}/sites/${host}:${path}`,
  );
  const id = String(site.id ?? "").trim();
  if (!id) {
    throw new Error("Could not resolve SharePoint site id.");
  }
  return id;
}

async function listChildFolderNames(
  accessToken: string,
  childrenUrl: string,
): Promise<Map<string, string>> {
  const data = await graphJson<{
    value?: { id?: string; name?: string; folder?: unknown }[];
  }>(accessToken, childrenUrl);
  const byName = new Map<string, string>();
  for (const item of data.value ?? []) {
    if (!item.folder || !item.id || !item.name) {
      continue;
    }
    byName.set(item.name, item.id);
  }
  return byName;
}

async function ensureChildFolder(
  accessToken: string,
  parentChildrenUrl: string,
  createUrl: string,
  folderName: string,
  existing: Map<string, string>,
): Promise<string> {
  const already = existing.get(folderName);
  if (already) {
    return already;
  }
  try {
    const created = await graphJson<{ id?: string }>(accessToken, createUrl, {
      method: "POST",
      body: JSON.stringify({
        name: folderName,
        folder: {},
        "@microsoft.graph.conflictBehavior": "fail",
      }),
    });
    if (created.id) {
      existing.set(folderName, created.id);
      return created.id;
    }
  } catch {
    // Likely already exists — re-list.
  }
  const refreshed = await listChildFolderNames(accessToken, parentChildrenUrl);
  for (const [name, id] of refreshed) {
    existing.set(name, id);
  }
  const id = existing.get(folderName);
  if (!id) {
    throw new Error(`Could not create or find folder "${folderName}".`);
  }
  return id;
}

/**
 * Create under Shared Documents:
 *   `{yymmdd} - {Project Name} - {UniqueID}/`
 *     `{Project Name}/`
 */
export async function createProjectSharePointFolders(
  instance: IPublicClientApplication,
  account: AccountInfo,
  input: { projectName: string; uniqueId: string },
): Promise<{ folderName: string; webUrl: string }> {
  if (!isSharePointConfigured()) {
    throw new Error(
      "SharePoint is not configured. Set NEXT_PUBLIC_SHAREPOINT_SITE_ID (or HOST + PATH).",
    );
  }

  const projectName =
    sanitizeSharePointFolderName(input.projectName) || "Project";
  const folderName = buildProjectSharePointFolderName(input);
  const accessToken = await acquireSharePointToken(instance, account);
  const siteId = await resolveSiteId(accessToken);

  const drive = await graphJson<{ id?: string; webUrl?: string }>(
    accessToken,
    `${GRAPH}/sites/${siteId}/drive?$select=id,webUrl`,
  );
  const driveId = String(drive.id ?? "").trim();
  if (!driveId) {
    throw new Error("Could not open SharePoint Documents library.");
  }

  const rootChildrenUrl = `${GRAPH}/drives/${driveId}/root/children?$select=id,name,folder&$top=200`;
  const rootFolders = await listChildFolderNames(accessToken, rootChildrenUrl);
  const projectFolderId = await ensureChildFolder(
    accessToken,
    rootChildrenUrl,
    `${GRAPH}/drives/${driveId}/root/children`,
    folderName,
    rootFolders,
  );

  const projectChildrenUrl = `${GRAPH}/drives/${driveId}/items/${projectFolderId}/children?$select=id,name,folder&$top=200`;
  const projectFolders = await listChildFolderNames(
    accessToken,
    projectChildrenUrl,
  );
  await ensureChildFolder(
    accessToken,
    projectChildrenUrl,
    `${GRAPH}/drives/${driveId}/items/${projectFolderId}/children`,
    projectName,
    projectFolders,
  );

  const folder = await graphJson<{ webUrl?: string }>(
    accessToken,
    `${GRAPH}/drives/${driveId}/items/${projectFolderId}?$select=webUrl`,
  );

  return {
    folderName,
    webUrl: String(folder.webUrl ?? drive.webUrl ?? "").trim(),
  };
}
