import {
  todayIsoInLosAngeles,
  todayMmDdYyyyInLosAngeles,
  type ProjectDetailEntry,
} from "@/lib/project-details";

/** Snapshot row written by Today To-Do / history scripts. */
export type ProjectHistoryEntry = {
  id: string;
  displayId: string;
  customer: string;
  projectName: string;
  date: string;
  engineer: string;
  status: string;
  invoiced: string;
  recentActivity: string;
  recentActivityDate: string;
  actionTaken: string;
  actionTakenDate: string;
  comments: string;
  lastEmailReceivedClient: string;
  lastEmailReceivedDate: string;
  sourceProjectId?: string;
  createdAt: string;
};

export function normalizeProjectHistory(
  raw: Partial<ProjectHistoryEntry> & { id: string },
): ProjectHistoryEntry {
  return {
    id: raw.id,
    displayId: raw.displayId ?? "",
    customer: raw.customer ?? "",
    projectName: raw.projectName ?? "",
    date: raw.date ?? "",
    engineer: raw.engineer ?? "",
    status: raw.status ?? "",
    invoiced: raw.invoiced ?? "",
    recentActivity: raw.recentActivity ?? "",
    recentActivityDate: raw.recentActivityDate ?? "",
    actionTaken: raw.actionTaken ?? "",
    actionTakenDate: raw.actionTakenDate ?? "",
    comments: raw.comments ?? "",
    lastEmailReceivedClient: raw.lastEmailReceivedClient ?? "",
    lastEmailReceivedDate: raw.lastEmailReceivedDate ?? "",
    sourceProjectId: raw.sourceProjectId,
    createdAt: raw.createdAt ?? "",
  };
}

export function projectHistoryFromDetail(
  row: ProjectDetailEntry,
  input: {
    actionTaken?: string;
    actionTakenDate?: string;
    comments: string;
  },
): ProjectHistoryEntry {
  return normalizeProjectHistory({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    displayId: row.displayId,
    customer: row.customer,
    projectName: row.projectName,
    date: row.projectInitializeDate,
    engineer: row.engineer,
    status: row.status,
    invoiced: row.invoiced,
    recentActivity: row.recentActivity,
    recentActivityDate: row.recentActivityDate,
    actionTaken: input.actionTaken ?? row.pmActionItems,
    actionTakenDate:
      input.actionTakenDate ??
      row.pmActionItemsDate ??
      todayIsoInLosAngeles(),
    comments: input.comments,
    lastEmailReceivedClient: row.lastEmailReceivedClient,
    lastEmailReceivedDate: row.lastEmailReceivedDate,
    sourceProjectId: row.id,
    createdAt: new Date().toISOString(),
  });
}

/** True when PROJECTS reminder date (K) is set and ≤ today. */
export function isDueOnTodayToDoList(
  row: ProjectDetailEntry,
  today = todayIsoInLosAngeles(),
): boolean {
  const reminderDate = row.pmActionItemsDate.trim().slice(0, 10);
  if (!reminderDate) {
    return false;
  }
  return reminderDate <= today;
}

export function filterTodayToDoRows(
  rows: ProjectDetailEntry[],
  today = todayIsoInLosAngeles(),
): ProjectDetailEntry[] {
  return rows
    .filter((row) => isDueOnTodayToDoList(row, today))
    .sort((a, b) => {
      const aDate = a.pmActionItemsDate.trim().slice(0, 10);
      const bDate = b.pmActionItemsDate.trim().slice(0, 10);
      if (aDate !== bDate) {
        return aDate.localeCompare(bDate);
      }
      return a.displayId.localeCompare(b.displayId, undefined, {
        sensitivity: "base",
      });
    });
}

/**
 * Excel changeDate.gs (Done with change):
 * H ← J, I ← K, K ← new date. J text stays.
 * Actions Taken → Project History only; if J empty, use Actions Taken for H.
 */
export function applyRescheduleReminder(
  row: ProjectDetailEntry,
  newReminderDateIso: string,
  actionsTaken = "",
): ProjectDetailEntry {
  const reminder = row.pmActionItems.trim();
  const actions = actionsTaken.trim();
  const recentActivity = reminder || actions || row.recentActivity;
  const priorReminderDate = row.pmActionItemsDate.trim().slice(0, 10);

  return {
    ...row,
    recentActivity,
    recentActivityDate: priorReminderDate || todayIsoInLosAngeles(),
    pmActionItemsDate: newReminderDateIso.trim().slice(0, 10),
  };
}

/**
 * Excel clearReminderData.gs (Done / col A):
 * H ← J (Pm Action Items)
 * I ← today
 * clear J and K
 * Actions Taken → Project History comments (L)
 * If J was empty, use Actions Taken for H so Recent Activity is not wiped.
 */
export function applyClearReminder(
  row: ProjectDetailEntry,
  actionsTaken = "",
): ProjectDetailEntry {
  const reminder = row.pmActionItems.trim();
  const actions = actionsTaken.trim();
  const recentActivity = reminder || actions || row.recentActivity;

  return {
    ...row,
    recentActivity,
    recentActivityDate: todayIsoInLosAngeles(),
    pmActionItems: "",
    pmActionItemsDate: "",
  };
}

export function formatHistoryCommentDate(date = new Date()): string {
  return todayMmDdYyyyInLosAngeles(date);
}
