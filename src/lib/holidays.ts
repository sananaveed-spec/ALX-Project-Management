export type Holiday = {
  id: string;
  name: string;
  /** ISO date string YYYY-MM-DD */
  date: string;
};

function createId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `holiday-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createHoliday(partial?: Partial<Holiday>): Holiday {
  return {
    id: partial?.id ?? createId(),
    name: partial?.name?.trim() ?? "",
    date: partial?.date ?? "",
  };
}

export function normalizeHoliday(
  raw: Partial<Holiday> & { id: string },
): Holiday {
  return {
    id: raw.id,
    name: (raw.name ?? "").trim(),
    date: (raw.date ?? "").trim(),
  };
}

export function parseHolidays(parsed: unknown): Holiday[] {
  if (!Array.isArray(parsed)) {
    return [];
  }

  return parsed
    .filter(
      (item): item is Partial<Holiday> & { id: string } =>
        typeof item === "object" &&
        item !== null &&
        typeof (item as { id?: unknown }).id === "string",
    )
    .map(normalizeHoliday);
}

/** Unique holiday dates (YYYY-MM-DD). */
export function getHolidayDateSet(
  holidays: Array<Pick<Holiday, "date">>,
): Set<string> {
  const dates = new Set<string>();
  for (const holiday of holidays) {
    const date = holiday.date.trim();
    if (/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      dates.add(date);
    }
  }
  return dates;
}

export function formatHolidayDate(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return isoDate;
  }
  const [year, month, day] = isoDate.split("-");
  return `${day}-${month}-${year}`;
}

/** Weekday name for YYYY-MM-DD (local calendar date). */
export function getHolidayDayName(isoDate: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(isoDate)) {
    return "";
  }

  const [year, month, day] = isoDate.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return "";
  }

  return date.toLocaleDateString("en-US", { weekday: "long" });
}
