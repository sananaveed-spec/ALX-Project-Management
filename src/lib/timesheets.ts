/**
 * Timesheets / ATS (SolidTime) helpers.
 * Same API as Utilization Dashboard: https://timesheets.allumiax.com/api/v1
 */

const DEFAULT_BASE_URL = "https://timesheets.allumiax.com/api/v1";
const DEFAULT_PROJECT_COLOR = "#0f6e56";

export function getTimesheetsConfig() {
  const apiToken = process.env.TIMESHEETS_API_TOKEN?.trim() || "";
  const organizationId = process.env.TIMESHEETS_ORGANIZATION_ID?.trim() || "";
  const baseUrl =
    process.env.TIMESHEETS_API_BASE_URL?.trim() || DEFAULT_BASE_URL;
  const timezone =
    process.env.TIMESHEETS_TIMEZONE?.trim() || "America/Los_Angeles";

  return { apiToken, organizationId, baseUrl, timezone };
}

export function isTimesheetsConfigured() {
  const { apiToken, organizationId } = getTimesheetsConfig();
  return Boolean(
    apiToken &&
      organizationId &&
      apiToken !== "your_api_token_here" &&
      organizationId !== "your_organization_id_here",
  );
}

function orgProjectsUrl() {
  const { baseUrl, organizationId } = getTimesheetsConfig();
  return `${baseUrl.replace(/\/$/, "")}/organizations/${organizationId}/projects`;
}

function orgMembersUrl() {
  const { baseUrl, organizationId } = getTimesheetsConfig();
  return `${baseUrl.replace(/\/$/, "")}/organizations/${organizationId}/members`;
}

export type TimesheetsUser = {
  id: string;
  name: string;
  email: string;
};

/** Active organization members from ATS / Timesheets (SolidTime). */
export async function listActiveTimesheetsUsers(): Promise<TimesheetsUser[]> {
  if (!isTimesheetsConfigured()) {
    throw new Error(
      "ATS / Timesheets is not configured. Set TIMESHEETS_API_TOKEN and TIMESHEETS_ORGANIZATION_ID.",
    );
  }

  const { apiToken } = getTimesheetsConfig();
  let response: Response;
  try {
    response = await fetch(orgMembersUrl(), {
      method: "GET",
      headers: {
        Authorization: `Bearer ${apiToken}`,
        Accept: "application/json",
      },
      cache: "no-store",
    });
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Unknown network error";
    throw new Error(
      `Could not reach ATS / Timesheets to load engineers (${detail}). Check network and TIMESHEETS_API_BASE_URL.`,
    );
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ATS list users failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    data?: Array<{
      id?: string;
      name?: string | null;
      email?: string | null;
      is_placeholder?: boolean | null;
    }>;
  };

  return (json.data ?? [])
    .filter((member) => member.is_placeholder !== true)
    .map((member) => ({
      id: member.id?.trim() || "",
      name: member.name?.trim() || "",
      email: member.email?.trim() || "",
    }))
    .filter((user) => Boolean(user.id && user.name))
    .sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
    );
}

export async function findTimesheetsProjectByName(name: string): Promise<{
  id: string;
  name: string;
} | null> {
  if (!isTimesheetsConfigured()) {
    throw new Error(
      "ATS / Timesheets is not configured. Set TIMESHEETS_API_TOKEN and TIMESHEETS_ORGANIZATION_ID.",
    );
  }

  const target = name.trim().toLowerCase();
  if (!target) {
    return null;
  }

  const { apiToken } = getTimesheetsConfig();
  const response = await fetch(orgProjectsUrl(), {
    method: "GET",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ATS list projects failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    data?: Array<{ id?: string; name?: string | null }>;
  };

  const match = (json.data ?? []).find(
    (project) => project.name?.trim().toLowerCase() === target,
  );

  if (!match?.id) {
    return null;
  }

  return {
    id: match.id,
    name: match.name?.trim() || name.trim(),
  };
}

export async function createTimesheetsProject(input: {
  name: string;
  color?: string;
  isBillable?: boolean;
  isPublic?: boolean;
}) {
  if (!isTimesheetsConfigured()) {
    throw new Error(
      "ATS / Timesheets is not configured. Set TIMESHEETS_API_TOKEN and TIMESHEETS_ORGANIZATION_ID.",
    );
  }

  const projectName = input.name.trim();
  const existing = await findTimesheetsProjectByName(projectName);
  if (existing) {
    throw new Error(
      `An ATS / Timesheets project named "${projectName}" already exists. Uncheck Create on ATS, or use a different Full Name.`,
    );
  }

  const { apiToken } = getTimesheetsConfig();
  const response = await fetch(orgProjectsUrl(), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiToken}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: projectName,
      color: input.color || DEFAULT_PROJECT_COLOR,
      is_billable: input.isBillable ?? true,
      is_public: input.isPublic ?? true,
      client_id: null,
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`ATS create project failed (${response.status}): ${text}`);
  }

  const json = (await response.json()) as {
    data?: { id?: string; name?: string };
  };

  return {
    id: json.data?.id,
    name: json.data?.name ?? projectName,
  };
}
