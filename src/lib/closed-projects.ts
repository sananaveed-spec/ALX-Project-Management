import {
  normalizeProjectDetail,
  todayIsoInLosAngeles,
  type ProjectDetailEntry,
} from "@/lib/project-details";

/** Closed Projects = Active Projects snapshot after Close (before Completed). */
export type ClosedProjectEntry = ProjectDetailEntry & {
  closedAt: string;
  sourceProjectId?: string;
};

export function normalizeClosedProject(
  raw: Partial<ClosedProjectEntry> & { id: string },
): ClosedProjectEntry {
  const detail = normalizeProjectDetail(raw);
  return {
    ...detail,
    closedAt: raw.closedAt?.trim() || todayIsoInLosAngeles(),
    sourceProjectId: raw.sourceProjectId,
  };
}

export function closedProjectFromDetail(
  row: ProjectDetailEntry,
): ClosedProjectEntry {
  return normalizeClosedProject({
    ...row,
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    sourceProjectId: row.id,
    closedAt: todayIsoInLosAngeles(),
  });
}

/** Strip close-only fields so Completed / invoice helpers see a normal detail row. */
export function detailFromClosedProject(
  row: ClosedProjectEntry,
): ProjectDetailEntry {
  return normalizeProjectDetail(row);
}

export function sortClosedProjectsNewestFirst(
  rows: ClosedProjectEntry[],
): ClosedProjectEntry[] {
  return [...rows].sort((a, b) => {
    const byClosed = b.closedAt.localeCompare(a.closedAt);
    if (byClosed !== 0) {
      return byClosed;
    }
    const aTime = Number.parseInt(a.id.split("-")[0] ?? "", 10);
    const bTime = Number.parseInt(b.id.split("-")[0] ?? "", 10);
    if (Number.isFinite(aTime) && Number.isFinite(bTime) && aTime !== bTime) {
      return bTime - aTime;
    }
    return a.displayId.localeCompare(b.displayId, undefined, {
      sensitivity: "base",
    });
  });
}
