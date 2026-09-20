import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { getDataDir } from "@/lib/data-store";

export type BasecampTokens = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
};

function requireEnv(name: string) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in environment.`);
  }
  return value;
}

export function getBasecampConfig() {
  return {
    accountId: requireEnv("BASECAMP_ACCOUNT_ID"),
    clientId: requireEnv("BASECAMP_CLIENT_ID"),
    clientSecret: requireEnv("BASECAMP_CLIENT_SECRET"),
    redirectUri:
      process.env.BASECAMP_REDIRECT_URI?.trim() ||
      "http://localhost:5174/api/basecamp/callback",
    userAgent:
      process.env.BASECAMP_USER_AGENT?.trim() ||
      "ALX Project Management (support@allumiax.com)",
    // Home-screen folder (per connected user). Empty string skips filing.
    folderName: process.env.BASECAMP_FOLDER_NAME?.trim() || "TestBySana",
  };
}

type BasecampFolder = {
  id: number;
  name?: string;
  bucket_ids?: number[];
};

async function basecampApiFetch(
  pathSuffix: string,
  init: RequestInit & { accessToken: string },
) {
  const { accountId, userAgent } = getBasecampConfig();
  const { accessToken, ...rest } = init;
  const headers = new Headers(rest.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  headers.set("User-Agent", userAgent);
  if (rest.body && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }

  return fetch(`https://3.basecampapi.com/${accountId}${pathSuffix}`, {
    ...rest,
    headers,
  });
}

function tokensPath() {
  return path.join(getDataDir(), "basecamp-tokens.json");
}

async function ensureDataDir() {
  await mkdir(getDataDir(), { recursive: true });
}

export async function readBasecampTokens(): Promise<BasecampTokens | null> {
  await ensureDataDir();
  try {
    const raw = await readFile(tokensPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<BasecampTokens>;
    if (
      typeof parsed.accessToken !== "string" ||
      typeof parsed.refreshToken !== "string" ||
      typeof parsed.expiresAt !== "number"
    ) {
      return null;
    }
    return {
      accessToken: parsed.accessToken,
      refreshToken: parsed.refreshToken,
      expiresAt: parsed.expiresAt,
    };
  } catch {
    return null;
  }
}

export async function writeBasecampTokens(tokens: BasecampTokens) {
  await ensureDataDir();
  await writeFile(tokensPath(), JSON.stringify(tokens, null, 2), "utf8");
}

export function getBasecampAuthorizeUrl() {
  const { clientId, redirectUri } = getBasecampConfig();
  const params = new URLSearchParams({
    type: "web_server",
    client_id: clientId,
    redirect_uri: redirectUri,
  });
  return `https://launchpad.37signals.com/authorization/new?${params.toString()}`;
}

export async function exchangeBasecampCode(code: string) {
  const { clientId, clientSecret, redirectUri } = getBasecampConfig();
  const body = new URLSearchParams({
    type: "web_server",
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    code,
  });

  const response = await fetch(
    "https://launchpad.37signals.com/authorization/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Basecamp token exchange failed: ${text}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token || !data.refresh_token) {
    throw new Error("Basecamp token response missing access/refresh token.");
  }

  const tokens: BasecampTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    expiresAt: Date.now() + (data.expires_in ?? 1209600) * 1000,
  };
  await writeBasecampTokens(tokens);
  return tokens;
}

async function refreshBasecampTokens(tokens: BasecampTokens) {
  const { clientId, clientSecret } = getBasecampConfig();
  const body = new URLSearchParams({
    type: "refresh",
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: tokens.refreshToken,
  });

  const response = await fetch(
    "https://launchpad.37signals.com/authorization/token",
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body,
    },
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Basecamp token refresh failed: ${text}`);
  }

  const data = (await response.json()) as {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
  };

  if (!data.access_token) {
    throw new Error("Basecamp refresh response missing access token.");
  }

  const next: BasecampTokens = {
    accessToken: data.access_token,
    refreshToken: data.refresh_token || tokens.refreshToken,
    expiresAt: Date.now() + (data.expires_in ?? 1209600) * 1000,
  };
  await writeBasecampTokens(next);
  return next;
}

export async function getValidBasecampAccessToken() {
  const tokens = await readBasecampTokens();
  if (!tokens) {
    return null;
  }

  // Refresh 60s early.
  if (tokens.expiresAt > Date.now() + 60_000) {
    return tokens.accessToken;
  }

  const refreshed = await refreshBasecampTokens(tokens);
  return refreshed.accessToken;
}

export async function isBasecampConnected() {
  const token = await getValidBasecampAccessToken();
  return Boolean(token);
}

async function listBasecampFolders(accessToken: string) {
  const response = await basecampApiFetch("/stacks.json", {
    method: "GET",
    accessToken,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Basecamp list folders failed: ${text}`);
  }
  return (await response.json()) as BasecampFolder[];
}

async function getBasecampFolder(accessToken: string, folderId: number) {
  const response = await basecampApiFetch(`/stacks/${folderId}.json`, {
    method: "GET",
    accessToken,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Basecamp get folder failed: ${text}`);
  }
  return (await response.json()) as BasecampFolder;
}

async function createBasecampFolder(
  accessToken: string,
  name: string,
  projectIds: number[],
) {
  const response = await basecampApiFetch("/stacks.json", {
    method: "POST",
    accessToken,
    body: JSON.stringify({ name, project_ids: projectIds }),
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Basecamp create folder failed: ${text}`);
  }
  return (await response.json()) as BasecampFolder;
}

async function deleteBasecampFolder(accessToken: string, folderId: number) {
  const response = await basecampApiFetch(`/stacks/${folderId}.json`, {
    method: "DELETE",
    accessToken,
  });
  if (!response.ok && response.status !== 204) {
    const text = await response.text();
    throw new Error(`Basecamp delete folder failed: ${text}`);
  }
}

/**
 * Files a project into a home-screen folder for the connected Basecamp user.
 * Basecamp only documents project_ids on folder create, so existing folders are
 * recreated with the prior bucket_ids plus the new project id.
 */
export async function fileProjectIntoBasecampFolder(
  accessToken: string,
  projectId: number,
  folderName: string,
) {
  const folders = await listBasecampFolders(accessToken);
  const existing = folders.find(
    (folder) => folder.name?.trim().toLowerCase() === folderName.toLowerCase(),
  );

  if (!existing) {
    await createBasecampFolder(accessToken, folderName, [projectId]);
    return;
  }

  const detail = await getBasecampFolder(accessToken, existing.id);
  const nextIds = Array.from(
    new Set([...(detail.bucket_ids ?? existing.bucket_ids ?? []), projectId]),
  );

  // Undocumented: some accounts may accept project_ids on update.
  const updateResponse = await basecampApiFetch(`/stacks/${existing.id}.json`, {
    method: "PUT",
    accessToken,
    body: JSON.stringify({ name: folderName, project_ids: nextIds }),
  });
  if (updateResponse.ok) {
    const updated = (await updateResponse.json()) as BasecampFolder;
    if (updated.bucket_ids?.includes(projectId)) {
      return;
    }
  }

  await deleteBasecampFolder(accessToken, existing.id);
  await createBasecampFolder(accessToken, folderName, nextIds);
}

export async function findBasecampProjectByName(name: string): Promise<{
  id: number;
  name: string;
  app_url?: string;
} | null> {
  const accessToken = await getValidBasecampAccessToken();
  if (!accessToken) {
    throw new Error(
      "Basecamp is not connected. Connect Basecamp first, then try again.",
    );
  }

  const target = name.trim().toLowerCase();
  if (!target) {
    return null;
  }

  const response = await basecampApiFetch("/projects.json", {
    method: "GET",
    accessToken,
  });
  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Basecamp list projects failed: ${text}`);
  }

  const projects = (await response.json()) as Array<{
    id?: number;
    name?: string;
    app_url?: string;
    status?: string;
  }>;

  const match = projects.find(
    (project) =>
      typeof project.id === "number" &&
      project.name?.trim().toLowerCase() === target,
  );

  if (!match || typeof match.id !== "number") {
    return null;
  }

  return {
    id: match.id,
    name: match.name?.trim() || name.trim(),
    app_url: match.app_url,
  };
}

export async function createBasecampProject(input: {
  name: string;
  description?: string;
}) {
  const accessToken = await getValidBasecampAccessToken();
  if (!accessToken) {
    throw new Error(
      "Basecamp is not connected. Connect Basecamp first, then try again.",
    );
  }

  const projectName = input.name.trim();
  const existing = await findBasecampProjectByName(projectName);
  if (existing) {
    throw new Error(
      `A Basecamp project named "${projectName}" already exists. Uncheck Create on Basecamp, or use a different Full Name.`,
    );
  }

  const { folderName } = getBasecampConfig();
  const response = await basecampApiFetch("/projects.json", {
    method: "POST",
    accessToken,
    body: JSON.stringify({
      name: projectName,
      description: input.description ?? "",
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Basecamp create project failed: ${text}`);
  }

  const project = (await response.json()) as {
    id?: number;
    name?: string;
    app_url?: string;
  };

  if (folderName && typeof project.id === "number") {
    try {
      await fileProjectIntoBasecampFolder(accessToken, project.id, folderName);
    } catch (error) {
      const detail =
        error instanceof Error ? error.message : "Unknown folder error.";
      throw new Error(
        `Basecamp project was created, but filing into "${folderName}" failed: ${detail}`,
      );
    }
  }

  return project;
}
