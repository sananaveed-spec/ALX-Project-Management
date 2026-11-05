import { getHolidayDateSet, type Holiday } from "@/lib/holidays";
import {
  isPendingReminder,
  reminderDaysOverdue,
} from "@/lib/project-history";
import type { ProjectDetailEntry } from "@/lib/project-details";

export const TODO_EMAIL_FROM = "sana.naveed@allumiax.com";
export const TODO_EMAIL_TO = "Talha.qamar@allumiax.com";
export const TODO_EMAIL_TIME_ZONE = "Asia/Karachi";
export const TODO_EMAIL_SEND_HOUR = 15; // 3:00 PM PKT
export const TODO_EMAIL_ROLLING_DAYS = 30;

export type TodoEmailKind = "today" | "pending30";

export type TodoEmailScheduleEntry = {
  /** YYYY-MM-DD in Asia/Karachi */
  dateKey: string;
  kind: TodoEmailKind;
  status: "scheduled" | "sent";
  scheduledFor: string;
  subject: string;
  rowCount: number;
};

export type TodoEmailLastRun = {
  dateKey: string;
  kind: TodoEmailKind;
  sentAt: string;
  subject: string;
  rowCount: number;
  to: string;
};

export type TodoEmailScheduleStore = {
  /** From mailbox UPN (editable in Email Scheduling). */
  from: string;
  /** Comma/semicolon-separated To recipients (shared for all digests). */
  to: string;
  /** Last selected schedule row (slotKey) for preview. */
  selectedSlotKey: string;
  /** Legacy FireFly deferred-queue status (kept for display / migration). */
  entries: TodoEmailScheduleEntry[];
  /** Last successful live cron send (option 1). */
  lastRun: TodoEmailLastRun | null;
};

export type TodoEmailPlan = {
  dateKey: string;
  kind: TodoEmailKind;
  sendAt: Date;
  subject: string;
  html: string;
  rowCount: number;
  slotKey: string;
};

export function createEmptyTodoEmailScheduleStore(): TodoEmailScheduleStore {
  return {
    from: TODO_EMAIL_FROM,
    to: TODO_EMAIL_TO,
    selectedSlotKey: "",
    entries: [],
    lastRun: null,
  };
}

export function normalizeTodoEmailList(value: string): string {
  const seen = new Set<string>();
  const emails: string[] = [];
  for (const part of value.split(/[,;]+/)) {
    const email = part.trim();
    if (!email || !email.includes("@")) {
      continue;
    }
    const key = email.toLowerCase();
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    emails.push(email);
  }
  return emails.join(", ");
}

/** Single From address (first valid email in the string). */
export function normalizeTodoEmailFrom(value: string): string {
  const list = normalizeTodoEmailList(value);
  if (!list) {
    return "";
  }
  return list.split(",")[0]?.trim() || "";
}

export function normalizeTodoEmailScheduleStore(
  raw: unknown,
): TodoEmailScheduleStore {
  if (!raw || typeof raw !== "object") {
    return createEmptyTodoEmailScheduleStore();
  }
  const record = raw as {
    from?: unknown;
    to?: unknown;
    selectedSlotKey?: unknown;
    entries?: unknown;
    lastRun?: unknown;
  };
  const entries = Array.isArray(record.entries) ? record.entries : [];
  const to = normalizeTodoEmailList(String(record.to ?? "")) || TODO_EMAIL_TO;
  const from =
    normalizeTodoEmailFrom(String(record.from ?? "")) || TODO_EMAIL_FROM;
  const lastRunRaw =
    record.lastRun && typeof record.lastRun === "object"
      ? (record.lastRun as Record<string, unknown>)
      : null;
  const lastRun: TodoEmailLastRun | null =
    lastRunRaw && typeof lastRunRaw.dateKey === "string"
      ? {
          dateKey: String(lastRunRaw.dateKey),
          kind: lastRunRaw.kind === "pending30" ? "pending30" : "today",
          sentAt: String(lastRunRaw.sentAt ?? ""),
          subject: String(lastRunRaw.subject ?? ""),
          rowCount: Number(lastRunRaw.rowCount) || 0,
          to: String(lastRunRaw.to ?? ""),
        }
      : null;
  return {
    from,
    to,
    selectedSlotKey: String(record.selectedSlotKey ?? "").trim(),
    lastRun,
    entries: entries
      .filter(
        (item): item is TodoEmailScheduleEntry =>
          typeof item === "object" &&
          item !== null &&
          typeof (item as { dateKey?: unknown }).dateKey === "string" &&
          typeof (item as { kind?: unknown }).kind === "string" &&
          typeof (item as { status?: unknown }).status === "string",
      )
      .map((item) => ({
        dateKey: item.dateKey,
        kind: item.kind === "pending30" ? "pending30" : "today",
        status: item.status === "sent" ? "sent" : "scheduled",
        scheduledFor: String(item.scheduledFor ?? ""),
        subject: String(item.subject ?? ""),
        rowCount: Number(item.rowCount) || 0,
      })),
  };
}

export function todoEmailSlotKey(dateKey: string, kind: TodoEmailKind) {
  return `${dateKey}:${kind}`;
}

export function isTodoEmailSender(email: string): boolean {
  return email.trim().toLowerCase() === TODO_EMAIL_FROM.toLowerCase();
}

export function withTodoEmailRecipients(
  store: TodoEmailScheduleStore,
  to: string,
  from?: string,
): TodoEmailScheduleStore {
  return {
    ...store,
    to: normalizeTodoEmailList(to) || TODO_EMAIL_TO,
    from:
      from !== undefined
        ? normalizeTodoEmailFrom(from) || TODO_EMAIL_FROM
        : store.from || TODO_EMAIL_FROM,
  };
}

export function withTodoEmailSelectedSlot(
  store: TodoEmailScheduleStore,
  slotKey: string,
): TodoEmailScheduleStore {
  return {
    ...store,
    selectedSlotKey: slotKey.trim(),
  };
}

export function parseTodoEmailSlotKey(
  slotKey: string,
): { dateKey: string; kind: TodoEmailKind } | null {
  const trimmed = slotKey.trim();
  const match = /^(\d{4}-\d{2}-\d{2}):(today|pending30)$/.exec(trimmed);
  if (!match) {
    return null;
  }
  return {
    dateKey: match[1],
    kind: match[2] === "pending30" ? "pending30" : "today",
  };
}

/** Calendar YYYY-MM-DD in Asia/Karachi for an instant. */
export function pakistanDateKey(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: TODO_EMAIL_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function pakistanWeekday(dateKey: string): number {
  // 0=Sun … 6=Sat in Asia/Karachi
  const probe = new Date(`${dateKey}T12:00:00+05:00`);
  const name = new Intl.DateTimeFormat("en-US", {
    timeZone: TODO_EMAIL_TIME_ZONE,
    weekday: "short",
  }).format(probe);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[name] ?? -1;
}

export function todoEmailKindForDateKey(dateKey: string): TodoEmailKind | null {
  const weekday = pakistanWeekday(dateKey);
  if (weekday === 5) {
    return "pending30";
  }
  if (weekday >= 1 && weekday <= 4) {
    return "today";
  }
  return null;
}

/**
 * Live cron decision for "now" in Asia/Karachi:
 * skip weekend + holidays; Mon–Thu Today; Fri Pending 30d.
 */
export function shouldSendTodoEmail(
  holidays: Holiday[],
  now = new Date(),
): {
  send: boolean;
  dateKey: string;
  kind: TodoEmailKind | null;
  reason: string;
} {
  const dateKey = pakistanDateKey(now);
  const holidayDates = getHolidayDateSet(holidays);
  if (holidayDates.has(dateKey)) {
    return {
      send: false,
      dateKey,
      kind: null,
      reason: `Skipped — holiday on ${dateKey}.`,
    };
  }
  const kind = todoEmailKindForDateKey(dateKey);
  if (!kind) {
    return {
      send: false,
      dateKey,
      kind: null,
      reason: `Skipped — weekend (${dateKey}).`,
    };
  }
  return {
    send: true,
    dateKey,
    kind,
    reason:
      kind === "pending30"
        ? "Friday — send Pending (1–30 days) digest."
        : "Weekday — send Today To-Do digest.",
  };
}

export function alreadySentTodoEmailToday(
  store: TodoEmailScheduleStore,
  dateKey: string,
): boolean {
  return store.lastRun?.dateKey === dateKey;
}

export function withTodoEmailLastRun(
  store: TodoEmailScheduleStore,
  lastRun: TodoEmailLastRun,
): TodoEmailScheduleStore {
  return { ...store, lastRun };
}

/** 15:00 Asia/Karachi as a UTC Date for YYYY-MM-DD. */
export function pakistanSendAt(dateKey: string): Date {
  const hour = String(TODO_EMAIL_SEND_HOUR).padStart(2, "0");
  return new Date(`${dateKey}T${hour}:00:00+05:00`);
}

function addCalendarDays(dateKey: string, days: number): string {
  const base = new Date(`${dateKey}T12:00:00+05:00`);
  base.setUTCDate(base.getUTCDate() + days);
  return pakistanDateKey(base);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function formatSubjectDate(dateKey: string): string {
  const [y, m, d] = dateKey.split("-");
  return `${d}-${m}-${y}`;
}

export function buildTodoEmailSubject(
  kind: TodoEmailKind,
  dateKey: string,
): string {
  const label = formatSubjectDate(dateKey);
  return kind === "pending30"
    ? `Pending To-Do (30 days) — ${label}`
    : `Today To-Do — ${label}`;
}

export function filterTodoEmailRows(
  rows: ProjectDetailEntry[],
  kind: TodoEmailKind,
  dateKey: string,
): ProjectDetailEntry[] {
  if (kind === "today") {
    return rows
      .filter((row) => {
        const reminder = row.pmActionItemsDate.trim().slice(0, 10);
        return Boolean(reminder) && reminder === dateKey;
      })
      .sort((a, b) =>
        (a.displayId || a.projectName).localeCompare(
          b.displayId || b.projectName,
          undefined,
          { sensitivity: "base" },
        ),
      );
  }

  return rows
    .filter((row) => {
      if (!isPendingReminder(row, dateKey)) {
        return false;
      }
      const days = reminderDaysOverdue(row, dateKey);
      return days !== null && days >= 1 && days <= 30;
    })
    .sort((a, b) => {
      const aDate = a.pmActionItemsDate.trim().slice(0, 10);
      const bDate = b.pmActionItemsDate.trim().slice(0, 10);
      if (aDate !== bDate) {
        return aDate.localeCompare(bDate);
      }
      return (a.displayId || a.projectName).localeCompare(
        b.displayId || b.projectName,
        undefined,
        { sensitivity: "base" },
      );
    });
}

export function buildTodoEmailSlotContent(
  projectDetails: ProjectDetailEntry[],
  kind: TodoEmailKind,
  dateKey: string,
): { subject: string; html: string; rowCount: number } {
  const filtered = filterTodoEmailRows(projectDetails, kind, dateKey);
  return {
    subject: buildTodoEmailSubject(kind, dateKey),
    html: buildTodoEmailHtml(filtered, kind, dateKey),
    rowCount: filtered.length,
  };
}

export function buildTodoEmailHtml(
  rows: ProjectDetailEntry[],
  kind: TodoEmailKind,
  dateKey: string,
): string {
  const title =
    kind === "pending30"
      ? `Pending To-Do (last 30 days) — ${formatSubjectDate(dateKey)}`
      : `Today To-Do — ${formatSubjectDate(dateKey)}`;

  const header = [
    "PROJECT ID",
    "PROJECT NAME",
    "Recent Activity",
    "Reminder",
    "Reminder Date",
    "Days Due",
  ];

  const bodyRows =
    rows.length === 0
      ? `<tr><td colspan="6" style="padding:10px 12px;border:1px solid #ccc;color:#666;font-size:15px;">No items for this period.</td></tr>`
      : rows
          .map((row) => {
            const daysDue = reminderDaysOverdue(row, dateKey);
            const cells = [
              row.displayId,
              row.projectName,
              row.recentActivity,
              row.pmActionItems,
              row.pmActionItemsDate.trim().slice(0, 10),
              daysDue === null ? "—" : String(daysDue),
            ]
              .map(
                (value) =>
                  `<td style="padding:8px 10px;border:1px solid #ccc;vertical-align:top;font-size:15px;line-height:1.45;">${escapeHtml(value.trim() || "—").replace(/\n/g, "<br/>")}</td>`,
              )
              .join("");
            return `<tr>${cells}</tr>`;
          })
          .join("");

  // Fragment only (no html/body wrapper) so contentEditable edit/save round-trips cleanly.
  return `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:15px;color:#111;">
  <h2 style="font-size:18px;margin:0 0 12px;">${escapeHtml(title)}</h2>
  <table style="border-collapse:collapse;width:100%;font-size:15px;">
    <thead>
      <tr>
        ${header
          .map(
            (h) =>
              `<th style="padding:8px 10px;border:1px solid #ccc;background:#f3f3f3;text-align:left;font-size:14px;">${escapeHtml(h)}</th>`,
          )
          .join("")}
      </tr>
    </thead>
    <tbody>${bodyRows}</tbody>
  </table>
</div>`;
}

/** Wrap a saved/edited body fragment for Graph sendMail. */
export function wrapTodoEmailHtmlDocument(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) {
    return "";
  }
  if (/^<!DOCTYPE/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
    return trimmed;
  }
  return `<!DOCTYPE html>
<html>
<body style="font-family:Segoe UI,Arial,sans-serif;font-size:13px;color:#111;margin:16px;">
${trimmed}
</body>
</html>`;
}

export type UpcomingTodoSlot = {
  dateKey: string;
  kind: TodoEmailKind;
  sendAt: Date;
  slotKey: string;
  label: string;
};

/** Next eligible send slots over a rolling calendar window. */
export function listUpcomingTodoSlots(
  holidays: Holiday[],
  fromDate = new Date(),
  rollingDays = TODO_EMAIL_ROLLING_DAYS,
): UpcomingTodoSlot[] {
  const holidayDates = getHolidayDateSet(holidays);
  const startKey = pakistanDateKey(fromDate);
  const soonest = Date.now() + 60_000;
  const slots: UpcomingTodoSlot[] = [];

  for (let offset = 0; offset < rollingDays; offset += 1) {
    const dateKey = addCalendarDays(startKey, offset);
    if (holidayDates.has(dateKey)) {
      continue;
    }
    const kind = todoEmailKindForDateKey(dateKey);
    if (!kind) {
      continue;
    }
    const sendAt = pakistanSendAt(dateKey);
    if (sendAt.getTime() < soonest) {
      continue;
    }
    slots.push({
      dateKey,
      kind,
      sendAt,
      slotKey: todoEmailSlotKey(dateKey, kind),
      label:
        kind === "pending30"
          ? `Pending (30d) · ${formatSubjectDate(dateKey)} · 3:00 PM PKT`
          : `Today · ${formatSubjectDate(dateKey)} · 3:00 PM PKT`,
    });
  }

  return slots;
}

export function buildTodoEmailPlans(
  rows: ProjectDetailEntry[],
  holidays: Holiday[],
  schedule: TodoEmailScheduleStore,
  fromDate = new Date(),
): TodoEmailPlan[] {
  const scheduledKeys = new Set(
    schedule.entries
      .filter((entry) => entry.status === "scheduled" || entry.status === "sent")
      .map((entry) => todoEmailSlotKey(entry.dateKey, entry.kind)),
  );

  const plans: TodoEmailPlan[] = [];
  for (const slot of listUpcomingTodoSlots(holidays, fromDate)) {
    if (scheduledKeys.has(slot.slotKey)) {
      continue;
    }
    const auto = buildTodoEmailSlotContent(rows, slot.kind, slot.dateKey);
    plans.push({
      dateKey: slot.dateKey,
      kind: slot.kind,
      sendAt: slot.sendAt,
      subject: auto.subject,
      html: auto.html,
      rowCount: auto.rowCount,
      slotKey: slot.slotKey,
    });
  }
  return plans;
}

export function markTodoEmailScheduled(
  store: TodoEmailScheduleStore,
  plan: Pick<
    TodoEmailPlan,
    "dateKey" | "kind" | "sendAt" | "subject" | "rowCount" | "slotKey"
  >,
): TodoEmailScheduleStore {
  const nextEntries = store.entries.filter(
    (entry) => todoEmailSlotKey(entry.dateKey, entry.kind) !== plan.slotKey,
  );
  nextEntries.push({
    dateKey: plan.dateKey,
    kind: plan.kind,
    status: "scheduled",
    scheduledFor: plan.sendAt.toISOString(),
    subject: plan.subject,
    rowCount: plan.rowCount,
  });
  nextEntries.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
  return { ...store, entries: nextEntries };
}

/** Promote scheduled entries whose send time has passed to "sent". */
export function promoteDueTodoEmailEntries(
  store: TodoEmailScheduleStore,
  now = new Date(),
): { store: TodoEmailScheduleStore; changed: boolean } {
  let changed = false;
  const entries = store.entries.map((entry) => {
    if (entry.status !== "scheduled") {
      return entry;
    }
    const dueAt = entry.scheduledFor
      ? new Date(entry.scheduledFor)
      : pakistanSendAt(entry.dateKey);
    if (Number.isNaN(dueAt.getTime()) || dueAt.getTime() > now.getTime()) {
      return entry;
    }
    changed = true;
    return { ...entry, status: "sent" as const };
  });
  return changed
    ? { store: { ...store, entries }, changed: true }
    : { store, changed: false };
}

export type TodoEmailPreviewRow = {
  dateKey: string;
  kind: TodoEmailKind;
  slotKey: string;
  label: string;
  sendAt: string;
  status: "scheduled" | "sent" | "—";
  subject: string;
  rowCount: number | null;
};

export function buildTodoEmailPreview(
  holidays: Holiday[],
  schedule: TodoEmailScheduleStore,
  fromDate = new Date(),
): TodoEmailPreviewRow[] {
  const byKey = new Map(
    schedule.entries.map((entry) => [
      todoEmailSlotKey(entry.dateKey, entry.kind),
      entry,
    ]),
  );

  return listUpcomingTodoSlots(holidays, fromDate).map((slot) => {
    const entry = byKey.get(slot.slotKey);
    return {
      dateKey: slot.dateKey,
      kind: slot.kind,
      slotKey: slot.slotKey,
      label: slot.label,
      sendAt: slot.sendAt.toISOString(),
      status: entry?.status ?? "—",
      subject:
        entry?.subject || buildTodoEmailSubject(slot.kind, slot.dateKey),
      rowCount: entry ? entry.rowCount : null,
    };
  });
}

export function resolveTodoEmailPreviewContent(
  projectDetails: ProjectDetailEntry[],
  _schedule: TodoEmailScheduleStore,
  dateKey: string,
  kind: TodoEmailKind,
): {
  dateKey: string;
  kind: TodoEmailKind;
  slotKey: string;
  subject: string;
  html: string;
  rowCount: number;
} {
  const slotKey = todoEmailSlotKey(dateKey, kind);
  const auto = buildTodoEmailSlotContent(projectDetails, kind, dateKey);
  return {
    dateKey,
    kind,
    slotKey,
    subject: auto.subject,
    html: auto.html,
    rowCount: auto.rowCount,
  };
}
