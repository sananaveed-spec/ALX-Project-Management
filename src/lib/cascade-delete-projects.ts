import type { CompletedProjectEntry } from "@/lib/completed-projects";
import type { ProjectDetailEntry } from "@/lib/project-details";
import type { ProjectHistoryEntry } from "@/lib/project-history";
import type { ProjectEntry } from "@/lib/projects";

function normalizeId(value: string) {
  return value.trim().toLowerCase();
}

export function uniqueIdSet(ids: Iterable<string>) {
  return new Set(
    [...ids].map((id) => normalizeId(id)).filter(Boolean),
  );
}

export function cascadeFilterNaming(
  projects: ProjectEntry[],
  ids: Set<string>,
) {
  return projects.filter(
    (project) => !ids.has(normalizeId(project.uniqueId)),
  );
}

export function cascadeFilterDetails(
  rows: ProjectDetailEntry[],
  ids: Set<string>,
) {
  return rows.filter((row) => !ids.has(normalizeId(row.displayId)));
}

export function cascadeFilterCompleted(
  rows: CompletedProjectEntry[],
  ids: Set<string>,
) {
  return rows.filter((row) => !ids.has(normalizeId(row.displayId)));
}

export function cascadeFilterHistory(
  rows: ProjectHistoryEntry[],
  ids: Set<string>,
) {
  return rows.filter((row) => !ids.has(normalizeId(row.displayId)));
}

export type CascadeDeleteResult = {
  uniqueIds: string[];
  namingRemaining: ProjectEntry[];
  detailsRemaining: ProjectDetailEntry[];
  completedRemaining: CompletedProjectEntry[];
  historyRemaining: ProjectHistoryEntry[];
  removed: {
    naming: number;
    details: number;
    completed: number;
    history: number;
  };
};

export function applyCascadeDelete(input: {
  uniqueIds: string[];
  naming: ProjectEntry[];
  details: ProjectDetailEntry[];
  completed: CompletedProjectEntry[];
  history: ProjectHistoryEntry[];
}): CascadeDeleteResult {
  const ids = uniqueIdSet(input.uniqueIds);
  const namingRemaining = cascadeFilterNaming(input.naming, ids);
  const detailsRemaining = cascadeFilterDetails(input.details, ids);
  const completedRemaining = cascadeFilterCompleted(input.completed, ids);
  const historyRemaining = cascadeFilterHistory(input.history, ids);

  return {
    uniqueIds: [...ids],
    namingRemaining,
    detailsRemaining,
    completedRemaining,
    historyRemaining,
    removed: {
      naming: input.naming.length - namingRemaining.length,
      details: input.details.length - detailsRemaining.length,
      completed: input.completed.length - completedRemaining.length,
      history: input.history.length - historyRemaining.length,
    },
  };
}

export const CASCADE_DELETE_CONFIRM =
  "This permanently deletes matching rows from Project Naming, Active Projects, Completed Projects, and Project History.";
