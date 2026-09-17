export type ProjectEntry = {
  id: string;
  projectName: string;
  customer: string;
  awardDate: string;
  year: string;
  no: string;
  uniqueId: string;
  fullName: string;
};

/** UniqueID = Customer + Year + No (e.g. ESR + 19 + 001 → ESR19001). */
export function buildUniqueId(customer: string, year: string, no: string) {
  const yearPart = year.trim().length >= 2 ? year.trim().slice(-2) : year.trim();
  const noTrim = no.trim();
  const noPart = /^\d+$/.test(noTrim) ? noTrim.padStart(3, "0") : noTrim;
  return `${customer.trim()}${yearPart}${noPart}`;
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

export function normalizeProject(
  raw: Partial<ProjectEntry> & { id: string },
): ProjectEntry {
  const customer = raw.customer ?? "";
  const year = raw.year ?? "";
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
  };
}
