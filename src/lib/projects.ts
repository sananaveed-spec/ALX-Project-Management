export type ProjectEntry = {
  id: string;
  projectName: string;
  customer: string;
  awardDate: string;
  year: string;
  no: string;
  uniqueId: string;
  fullName: string;
  /** Optional; from New/Existing Project engineer dropdown. */
  engineer: string;
  /** Optional; PM from New/Existing Project ATS user dropdown. */
  pmName: string;
  /** "Yes" / "No" from QB checkbox on New/Existing Project. */
  qb: string;
  /** "Yes" when created on Basecamp at save time. */
  basecamp: string;
  /** "Yes" when created on ATS / Timesheets at save time. */
  ats: string;
  /** "Yes" when SharePoint project folders were created at save time. */
  sharepoint: string;
};

/**
 * Display / storage year as 4 digits (2018, 2026).
 * 2-digit values expand with pivot: 00–69 → 2000–2069, 70–99 → 1970–1999.
 * UniqueID still uses the last 2 digits via yearPartForUniqueId.
 */
export function normalizeProjectYear(year: string): string {
  const digits = year.trim().replace(/\D/g, "");
  if (!digits) {
    return "";
  }
  if (digits.length >= 4) {
    return digits.slice(0, 4);
  }
  if (digits.length === 3) {
    return `2${digits}`.slice(0, 4);
  }
  if (digits.length === 1) {
    return String(2000 + Number(digits));
  }
  const yy = Number.parseInt(digits, 10);
  if (!Number.isFinite(yy)) {
    return year.trim();
  }
  return String(yy <= 69 ? 2000 + yy : 1900 + yy);
}

/** UniqueID = Customer + Year + No (e.g. ESR + 2019 → 19 + 001 → ESR19001). */
export function buildUniqueId(customer: string, year: string, no: string) {
  const yearPart = yearPartForUniqueId(year);
  const noTrim = no.trim();
  const noPart = /^\d+$/.test(noTrim) ? noTrim.padStart(3, "0") : noTrim;
  return `${customer.trim()}${yearPart}${noPart}`;
}

export function yearPartForUniqueId(year: string) {
  const normalized = normalizeProjectYear(year);
  return normalized.length >= 2 ? normalized.slice(-2) : normalized;
}

/** Parse UniqueID suffix after Customer+Year: "001", "001.1", "217.1". */
function parseUniqueIdNoSuffix(suffix: string): {
  baseNo: number;
  point: number | null;
  label: string;
} | null {
  const match = /^(\d+)(?:\.(\d+))?$/.exec(suffix.trim());
  if (!match) {
    return null;
  }
  const baseNo = Number.parseInt(match[1], 10);
  if (!Number.isFinite(baseNo)) {
    return null;
  }
  const pointPart = match[2];
  const point =
    pointPart !== undefined ? Number.parseInt(pointPart, 10) : null;
  if (point !== null && !Number.isFinite(point)) {
    return null;
  }
  const baseLabel = String(baseNo).padStart(3, "0");
  return {
    baseNo,
    point,
    label: point === null ? baseLabel : `${baseLabel}.${point}`,
  };
}

/**
 * Highest No already used for Customer + Year (from UniqueIDs).
 * Includes point versions (e.g. ESR26001.1 beats ESR26001).
 * Suggested next is always the next base No (002), not another point.
 * Returns null when none exist yet.
 */
export function getMaxUsedNoForCustomerYear(
  projects: ProjectEntry[],
  customer: string,
  year: string,
  excludeId?: string | null,
): {
  maxNo: number;
  maxNoLabel: string;
  suggestedNext: string;
  maxUniqueId: string;
} | null {
  const customerPart = customer.trim();
  const yearPart = yearPartForUniqueId(year);
  if (!customerPart || !yearPart) {
    return null;
  }

  const prefix = `${customerPart}${yearPart}`.toLowerCase();
  let maxBaseNo = -1;
  let maxPoint = -1; // -1 = no point; any .N beats plain base
  let maxNoLabel = "";
  let maxUniqueId = "";

  for (const project of projects) {
    if (excludeId && project.id === excludeId) {
      continue;
    }
    const uniqueId = project.uniqueId.trim();
    if (!uniqueId.toLowerCase().startsWith(prefix)) {
      continue;
    }
    const suffix = uniqueId.slice(customerPart.length + yearPart.length);
    const parsed = parseUniqueIdNoSuffix(suffix);
    if (!parsed) {
      continue;
    }
    const pointRank = parsed.point === null ? -1 : parsed.point;
    const isHigher =
      parsed.baseNo > maxBaseNo ||
      (parsed.baseNo === maxBaseNo && pointRank > maxPoint);
    if (!isHigher) {
      continue;
    }
    maxBaseNo = parsed.baseNo;
    maxPoint = pointRank;
    maxNoLabel = parsed.label;
    maxUniqueId = uniqueId;
  }

  if (maxBaseNo < 0) {
    return null;
  }

  return {
    maxNo: maxBaseNo,
    maxNoLabel,
    suggestedNext: String(maxBaseNo + 1).padStart(3, "0"),
    maxUniqueId,
  };
}

/**
 * Next point-version No for Existing Project.
 * Examples: 001 → 001.1; 001.1 → 001.2 (uses highest .N for that base No).
 */
export function getNextPointNo(
  projects: ProjectEntry[],
  source: ProjectEntry,
): string | null {
  const customerPart = source.customer.trim();
  const yearPart = yearPartForUniqueId(source.year);
  if (!customerPart || !yearPart) {
    return null;
  }

  let baseNo: number | null = null;
  const fromNo = parseUniqueIdNoSuffix(source.no.trim());
  if (fromNo) {
    baseNo = fromNo.baseNo;
  } else {
    const prefix = `${customerPart}${yearPart}`;
    const uniqueId = source.uniqueId.trim();
    if (uniqueId.toLowerCase().startsWith(prefix.toLowerCase())) {
      const parsed = parseUniqueIdNoSuffix(uniqueId.slice(prefix.length));
      if (parsed) {
        baseNo = parsed.baseNo;
      }
    }
  }

  if (baseNo === null) {
    return null;
  }

  const prefix = `${customerPart}${yearPart}`.toLowerCase();
  let maxPoint = -1;

  for (const project of projects) {
    const uniqueId = project.uniqueId.trim();
    if (!uniqueId.toLowerCase().startsWith(prefix)) {
      continue;
    }
    const suffix = uniqueId.slice(customerPart.length + yearPart.length);
    const parsed = parseUniqueIdNoSuffix(suffix);
    if (!parsed || parsed.baseNo !== baseNo) {
      continue;
    }
    const pointRank = parsed.point === null ? -1 : parsed.point;
    if (pointRank > maxPoint) {
      maxPoint = pointRank;
    }
  }

  const nextPoint = maxPoint < 0 ? 1 : maxPoint + 1;
  const baseLabel = String(baseNo).padStart(3, "0");
  return `${baseLabel}.${nextPoint}`;
}

/** Full Name = UniqueID - Project Name (e.g. ESR19001 - Site Upgrade). */
export function buildFullName(uniqueId: string, projectName: string) {
  const id = uniqueId.trim();
  const name = projectName.trim();
  if (!id && !name) {
    return "";
  }
  if (!id) {
    return name;
  }
  if (!name) {
    return id;
  }
  return `${id} - ${name}`;
}

/**
 * Returns an error message when UniqueID is missing or already used.
 * Pass excludeId when editing so the current row is ignored.
 */
export function getUniqueIdConflict(
  uniqueId: string,
  projects: ProjectEntry[],
  excludeId?: string | null,
): string | null {
  const normalized = uniqueId.trim();
  if (!normalized) {
    return "UniqueID is required before saving.";
  }

  const taken = projects.some(
    (project) =>
      project.id !== excludeId &&
      project.uniqueId.trim().toLowerCase() === normalized.toLowerCase(),
  );

  if (taken) {
    return `UniqueID "${normalized}" already exists. Choose a different No or project.`;
  }

  return null;
}

/** Prefer newly created rows (timestamp ids) first, then keep relative order. */
export function sortProjectsNewestFirst(projects: ProjectEntry[]): ProjectEntry[] {
  return [...projects].sort((a, b) => {
    const aTime = Number.parseInt(a.id.split("-")[0] ?? "", 10);
    const bTime = Number.parseInt(b.id.split("-")[0] ?? "", 10);
    const aOk = Number.isFinite(aTime);
    const bOk = Number.isFinite(bTime);

    if (aOk && bOk && aTime !== bTime) {
      return bTime - aTime;
    }
    if (aOk && !bOk) {
      return -1;
    }
    if (!aOk && bOk) {
      return 1;
    }
    return 0;
  });
}

/** Update Project Naming engineer for a UniqueID (Active Projects ↔ Naming sync). */
export function applyEngineerToNamingByUniqueId(
  projects: ProjectEntry[],
  uniqueId: string,
  engineer: string,
): { projects: ProjectEntry[]; changed: boolean } {
  const key = uniqueId.trim().toLowerCase();
  if (!key) {
    return { projects, changed: false };
  }
  const nextEngineer = engineer.trim();
  let changed = false;
  const next = projects.map((project) => {
    if (project.uniqueId.trim().toLowerCase() !== key) {
      return project;
    }
    if (project.engineer.trim() === nextEngineer) {
      return project;
    }
    changed = true;
    return normalizeProject({ ...project, engineer: nextEngineer });
  });
  return { projects: next, changed };
}

export function normalizeProject(
  raw: Partial<ProjectEntry> & { id: string },
): ProjectEntry {
  const customer = raw.customer ?? "";
  const year = normalizeProjectYear(raw.year ?? "");
  const no = raw.no ?? "";
  const projectName = raw.projectName ?? "";
  const uniqueId = raw.uniqueId?.trim() || buildUniqueId(customer, year, no);

  return {
    id: raw.id,
    projectName,
    customer,
    awardDate: raw.awardDate ?? "",
    year,
    no,
    uniqueId,
    fullName:
      raw.fullName?.trim() || buildFullName(uniqueId, projectName),
    engineer: raw.engineer ?? "",
    pmName: raw.pmName ?? "",
    qb: normalizeQbFlag(raw.qb),
    basecamp: raw.basecamp ?? "",
    ats: raw.ats ?? "",
    sharepoint: raw.sharepoint ?? "",
  };
}

function normalizeQbFlag(value: string | undefined) {
  const trimmed = (value ?? "").trim().toLowerCase();
  if (trimmed === "yes" || trimmed === "y" || trimmed === "true") {
    return "Yes";
  }
  if (trimmed === "no" || trimmed === "n" || trimmed === "false") {
    return "No";
  }
  // Legacy rows without qb: treat as No.
  return "No";
}
