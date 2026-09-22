import type { ProjectDetailEntry } from "@/lib/project-details";
import { buildFullName, type ProjectEntry } from "@/lib/projects";

/** One project cell under an engineer on ENGINEER LOAD. */
export type EngineerLoadProject = {
  id: string;
  displayId: string;
  projectName: string;
  /** Excel “Stage” / Project Status — from Projects Status. */
  stage: string;
  priority: string;
};

export type EngineerLoadColumn = {
  engineer: string;
  projects: EngineerLoadProject[];
};

function resolveFullName(
  row: ProjectDetailEntry,
  namingById: Map<string, ProjectEntry>,
  namingByUniqueId: Map<string, ProjectEntry>,
): string {
  const fromNaming =
    (row.namingProjectId
      ? namingById.get(row.namingProjectId)
      : undefined) ??
    namingByUniqueId.get(row.displayId.trim().toLowerCase());

  const fullName =
    fromNaming?.fullName.trim() ||
    buildFullName(row.displayId, row.projectName) ||
    row.displayId.trim() ||
    row.projectName.trim();

  return fullName || "—";
}

/**
 * Excel ENGINEER LOAD: one column group per engineer
 * (Project Name | Stage | PRIORITY), filled from active PROJECTS.
 * Project Name shows Project Naming Full Name when available.
 */
export function buildEngineerLoadColumns(
  rows: ProjectDetailEntry[],
  namingProjects: ProjectEntry[] = [],
): EngineerLoadColumn[] {
  const namingById = new Map(
    namingProjects.map((project) => [project.id, project] as const),
  );
  const namingByUniqueId = new Map(
    namingProjects.map(
      (project) =>
        [project.uniqueId.trim().toLowerCase(), project] as const,
    ),
  );

  const byEngineer = new Map<string, EngineerLoadProject[]>();

  for (const row of rows) {
    const engineer = row.engineer.trim() || "Unassigned";
    const entry: EngineerLoadProject = {
      id: row.id,
      displayId: row.displayId,
      projectName: resolveFullName(row, namingById, namingByUniqueId),
      stage: formatStageLabel(row.status),
      priority: row.priority.trim(),
    };
    const list = byEngineer.get(engineer);
    if (list) {
      list.push(entry);
    } else {
      byEngineer.set(engineer, [entry]);
    }
  }

  const columns: EngineerLoadColumn[] = [...byEngineer.entries()].map(
    ([engineer, projects]) => ({
      engineer,
      projects: sortLoadProjects(projects),
    }),
  );

  columns.sort((a, b) => {
    if (a.engineer === "Unassigned") {
      return 1;
    }
    if (b.engineer === "Unassigned") {
      return -1;
    }
    return a.engineer.localeCompare(b.engineer, undefined, {
      sensitivity: "base",
    });
  });

  return columns;
}

export function engineerLoadMaxRows(columns: EngineerLoadColumn[]): number {
  return columns.reduce(
    (max, column) => Math.max(max, column.projects.length),
    0,
  );
}

/** Strip leading a./b./… status codes for Stage-style labels when present. */
export function formatStageLabel(status: string): string {
  const trimmed = status.trim();
  if (!trimmed) {
    return "";
  }
  const stripped = trimmed.replace(/^[a-z]\./i, "").trim();
  return stripped || trimmed;
}

function sortLoadProjects(
  projects: EngineerLoadProject[],
): EngineerLoadProject[] {
  return [...projects].sort((a, b) => {
    const byName = a.projectName.localeCompare(b.projectName, undefined, {
      sensitivity: "base",
    });
    if (byName !== 0) {
      return byName;
    }
    return a.displayId.localeCompare(b.displayId, undefined, {
      sensitivity: "base",
    });
  });
}
