import type { CompletedProjectEntry } from "@/lib/completed-projects";
import {
  isPartialOrFullInvoiced,
  type ProjectDetailEntry,
} from "@/lib/project-details";
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

export type DeleteBlockerReason =
  | "Project History"
  | "Completed Projects"
  | "Invoicing History";

export type DeleteBlocker = {
  /** Original UniqueID casing when available. */
  uniqueId: string;
  reasons: DeleteBlockerReason[];
};

/**
 * Block Naming / Active Projects delete when history must be preserved.
 * Invoicing History = Active Projects with Invoiced PARTIAL/FULL.
 */
export function findProjectDeleteBlockers(input: {
  uniqueIds: string[];
  details: ProjectDetailEntry[];
  completed: CompletedProjectEntry[];
  history: ProjectHistoryEntry[];
}): DeleteBlocker[] {
  const displayByNormalized = new Map<string, string>();
  for (const id of input.uniqueIds) {
    const trimmed = id.trim();
    if (!trimmed) {
      continue;
    }
    const key = normalizeId(trimmed);
    if (!displayByNormalized.has(key)) {
      displayByNormalized.set(key, trimmed);
    }
  }

  const historyIds = new Set(
    input.history.map((row) => normalizeId(row.displayId)).filter(Boolean),
  );
  const completedIds = new Set(
    input.completed.map((row) => normalizeId(row.displayId)).filter(Boolean),
  );
  const invoicingIds = new Set(
    input.details
      .filter((row) => isPartialOrFullInvoiced(row.invoiced))
      .map((row) => normalizeId(row.displayId))
      .filter(Boolean),
  );

  const blockers: DeleteBlocker[] = [];
  for (const [normalized, uniqueId] of displayByNormalized) {
    const reasons: DeleteBlockerReason[] = [];
    if (historyIds.has(normalized)) {
      reasons.push("Project History");
    }
    if (completedIds.has(normalized)) {
      reasons.push("Completed Projects");
    }
    if (invoicingIds.has(normalized)) {
      reasons.push("Invoicing History");
    }
    if (reasons.length > 0) {
      blockers.push({ uniqueId, reasons });
    }
  }

  return blockers;
}

export function formatDeleteBlockedMessage(blockers: DeleteBlocker[]): string {
  if (blockers.length === 0) {
    return "Cannot delete — project has preserved history.";
  }

  const lines = blockers.map((blocker) => {
    const reasons = blocker.reasons.join(", ");
    return `${blocker.uniqueId || "(no ID)"}: ${reasons}`;
  });

  const lead =
    blockers.length === 1
      ? "Cannot delete — this project has history that must be kept:"
      : "Cannot delete — these projects have history that must be kept:";

  return `${lead}\n${lines.join("\n")}`;
}

export type CascadeDeleteResult = {
  uniqueIds: string[];
  namingRemaining: ProjectEntry[];
  detailsRemaining: ProjectDetailEntry[];
  /** Completed / history are never removed by cascade delete. */
  completedRemaining: CompletedProjectEntry[];
  historyRemaining: ProjectHistoryEntry[];
  removed: {
    naming: number;
    details: number;
    completed: number;
    history: number;
  };
};

/** Removes Naming + Active Projects only. Never touches Completed or History. */
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

  return {
    uniqueIds: [...ids],
    namingRemaining,
    detailsRemaining,
    completedRemaining: input.completed,
    historyRemaining: input.history,
    removed: {
      naming: input.naming.length - namingRemaining.length,
      details: input.details.length - detailsRemaining.length,
      completed: 0,
      history: 0,
    },
  };
}

export const CASCADE_DELETE_CONFIRM =
  "This permanently deletes matching rows from Project Naming and Active Projects. Delete is blocked if the project exists in Project History, Completed Projects, or Invoicing History (PARTIAL/FULL).";
