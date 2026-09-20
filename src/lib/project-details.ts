export type ProjectDetailEntry = {
  id: string;
  /** Shown as ID column — mapped from Project Naming UniqueID. */
  displayId: string;
  customer: string;
  projectName: string;
  projectInitializeDate: string;
  engineer: string;
  status: string;
  invoiced: string;
  recentActivity: string;
  recentActivityDate: string;
  pmActionItems: string;
  pmActionItemsDate: string;
  lastEmailReceivedClient: string;
  lastEmailReceivedDate: string;
  priority: string;
  etaDays: string;
  revisionHistory: string;
  partialInvoicingDate: string;
  fullInvoicedDate: string;
  finalSccsSent: string;
  /** Ready to Invoice tab */
  readyToInvoiceDate: string;
  partialInvoiceHistory: string;
  pmComments: string;
  namingProjectId?: string;
};

export const READY_TO_INVOICE_VALUE = "READY TO INVOICE";

/** True when Status should stamp Final SCCS Sent (Excel col U). */
export function isFinalReportSentStatus(status: string): boolean {
  const normalized = status.trim().replace(/\s+/g, " ");
  return /^b\.Final Report(\s+\d+)?\s+Sent$/i.test(normalized);
}

/**
 * Excel ReportDateReminder: when Status changes to these values,
 * auto-fill PM Action Items (J) + reminder date (K).
 */
export function reminderFieldsForStatus(status: string): {
  pmActionItems: string;
  pmActionItemsDate: string;
} | null {
  const normalized = status.trim().replace(/\s+/g, " ");

  const finalReady = normalized.match(
    /^w\.Final Report(?:\s+(\d+))?\s+Ready$/i,
  );
  if (finalReady) {
    const n = finalReady[1];
    return {
      pmActionItems: n
        ? `Review stamp and send Final report ${n}`
        : "Review stamp and send Final report",
      pmActionItemsDate: todayIsoInLosAngeles(),
    };
  }

  if (/^v\.Preliminary Report Ready$/i.test(normalized)) {
    return {
      pmActionItems: "Review stamp and send Preliminary report",
      pmActionItemsDate: todayIsoInLosAngeles(),
    };
  }

  if (/^k\.Preliminary Report Sent$/i.test(normalized)) {
    const date = new Date();
    date.setDate(date.getDate() + 14);
    return {
      pmActionItems:
        "Followup on approval from EOR for Preliminary report",
      pmActionItemsDate: todayIsoInLosAngeles(date),
    };
  }

  return null;
}

/** True when Invoiced should appear on the Invoicing History tab. */
export function isPartialOrFullInvoiced(invoiced: string): boolean {
  const normalized = invoiced.trim().toUpperCase().replace(/\s+/g, " ");
  return normalized === "PARTIAL" || normalized === "FULL";
}

/** Excel Invoicing History col S: prefer append history, else legacy date field. */
export function partialInvoicesDisplay(row: {
  partialInvoiceHistory: string;
  partialInvoicingDate: string;
}): string {
  const history = row.partialInvoiceHistory.trim();
  if (history) {
    return history;
  }
  return row.partialInvoicingDate.trim();
}

/** Rows for Invoicing History (PARTAL/FULL), newest Projects rows first. */
export function filterInvoicingHistoryRows(
  rows: ProjectDetailEntry[],
): ProjectDetailEntry[] {
  return sortProjectDetailsNewestFirst(
    rows.filter((row) => isPartialOrFullInvoiced(row.invoiced)),
  );
}

/** True when Projects → Invoiced should appear on the Ready to Invoice tab. */
export function isReadyToInvoice(invoiced: string): boolean {
  const normalized = invoiced.trim().toUpperCase().replace(/\s+/g, " ");
  return (
    normalized === READY_TO_INVOICE_VALUE ||
    normalized === "READY TO INVOICED"
  );
}

export function todayIsoInLosAngeles(date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Excel DateEnter format for Full Invoiced Date (col T). */
export function todayMmDdYyyyInLosAngeles(date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

/** Excel OnEdit FULL path text for PROJECTS col T. */
export function formatFullInvoiceNote(invoiceNumber: string, date = new Date()) {
  return `Invoice Number: ${invoiceNumber.trim()}, Date: ${date.toString()}`;
}

/** Excel OnEdit PARTIAL append line for PROJECTS col S. */
export function formatPartialInvoiceLine(
  invoiceNumber: string,
  percentInvoiced: string,
  date = new Date(),
) {
  return `Invoice Number: ${invoiceNumber.trim()}, Percent Invoiced: ${percentInvoiced.trim()}%, Date: ${date.toString()}`;
}

export function appendPartialInvoiceHistory(
  existing: string,
  invoiceNumber: string,
  percentInvoiced: string,
  date = new Date(),
) {
  const line = formatPartialInvoiceLine(invoiceNumber, percentInvoiced, date);
  const current = existing.replace(/\s+$/g, "");
  return current ? `${current}\n${line}` : line;
}

export function normalizeProjectDetail(
  raw: Partial<ProjectDetailEntry> & { id: string },
): ProjectDetailEntry {
  return {
    id: raw.id,
    displayId: raw.displayId ?? "",
    customer: raw.customer ?? "",
    projectName: raw.projectName ?? "",
    projectInitializeDate: raw.projectInitializeDate ?? "",
    engineer: raw.engineer ?? "",
    status: raw.status ?? "",
    invoiced: raw.invoiced ?? "",
    recentActivity: raw.recentActivity ?? "",
    recentActivityDate: raw.recentActivityDate ?? "",
    pmActionItems: raw.pmActionItems ?? "",
    pmActionItemsDate: raw.pmActionItemsDate ?? "",
    lastEmailReceivedClient: raw.lastEmailReceivedClient ?? "",
    lastEmailReceivedDate: raw.lastEmailReceivedDate ?? "",
    priority: raw.priority ?? "",
    etaDays: raw.etaDays ?? "",
    revisionHistory: raw.revisionHistory ?? "",
    partialInvoicingDate: raw.partialInvoicingDate ?? "",
    fullInvoicedDate: raw.fullInvoicedDate ?? "",
    finalSccsSent: raw.finalSccsSent ?? "",
    readyToInvoiceDate: raw.readyToInvoiceDate ?? "",
    partialInvoiceHistory: raw.partialInvoiceHistory ?? "",
    pmComments: raw.pmComments ?? "",
    namingProjectId: raw.namingProjectId,
  };
}

/** Map Project Naming fields into a Projects-tab row. */
export function projectDetailFromNaming(input: {
  namingProjectId: string;
  uniqueId: string;
  customer: string;
  projectName: string;
  awardDate: string;
  engineer?: string;
}): ProjectDetailEntry {
  return normalizeProjectDetail({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    displayId: input.uniqueId.trim(),
    customer: input.customer.trim(),
    projectName: input.projectName.trim(),
    projectInitializeDate: input.awardDate.trim(),
    engineer: input.engineer?.trim() ?? "",
    namingProjectId: input.namingProjectId,
  });
}

export function sortProjectDetailsNewestFirst(
  rows: ProjectDetailEntry[],
): ProjectDetailEntry[] {
  return [...rows].sort((a, b) => {
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
    return a.displayId.localeCompare(b.displayId, undefined, {
      sensitivity: "base",
    });
  });
}

/** Excel AutoSortScript: sort by Status (col F) descending. */
export function sortProjectDetailsByStatusDesc(
  rows: ProjectDetailEntry[],
): ProjectDetailEntry[] {
  return [...rows].sort((a, b) => {
    const aStatus = a.status.trim();
    const bStatus = b.status.trim();
    if (!aStatus && !bStatus) {
      return 0;
    }
    if (!aStatus) {
      return 1;
    }
    if (!bStatus) {
      return -1;
    }
    const byStatus = bStatus.localeCompare(aStatus, undefined, {
      sensitivity: "base",
      numeric: true,
    });
    if (byStatus !== 0) {
      return byStatus;
    }
    return a.displayId.localeCompare(b.displayId, undefined, {
      sensitivity: "base",
    });
  });
}

/** Upsert by displayId (UniqueID). Keeps existing detail fields when updating. */
export function upsertProjectDetailFromNaming(
  rows: ProjectDetailEntry[],
  input: {
    namingProjectId: string;
    uniqueId: string;
    customer: string;
    projectName: string;
    awardDate: string;
    /** When set on create (or explicit update), writes Projects → Engineer. */
    engineer?: string;
  },
): ProjectDetailEntry[] {
  const displayId = input.uniqueId.trim();
  const existingIndex = rows.findIndex(
    (row) =>
      row.displayId.trim().toLowerCase() === displayId.toLowerCase() ||
      row.namingProjectId === input.namingProjectId,
  );

  if (existingIndex >= 0) {
    const existing = rows[existingIndex];
    const next = [...rows];
    next[existingIndex] = {
      ...existing,
      displayId,
      customer: input.customer.trim(),
      projectName: input.projectName.trim(),
      projectInitializeDate: input.awardDate.trim(),
      namingProjectId: input.namingProjectId,
      ...(input.engineer !== undefined
        ? { engineer: input.engineer.trim() }
        : {}),
    };
    return sortProjectDetailsNewestFirst(next);
  }

  return sortProjectDetailsNewestFirst([
    projectDetailFromNaming(input),
    ...rows,
  ]);
}

/**
 * Ensure every Project Naming row has a Projects tab row.
 * Skips UniqueIDs already in Completed Projects (so completed work stays archived).
 */
export function syncProjectDetailsFromNaming(
  details: ProjectDetailEntry[],
  naming: Array<{
    id: string;
    uniqueId: string;
    customer: string;
    projectName: string;
    awardDate: string;
  }>,
  completedDisplayIds: Iterable<string> = [],
): { rows: ProjectDetailEntry[]; added: number; updated: number } {
  const completed = new Set(
    [...completedDisplayIds]
      .map((id) => id.trim().toLowerCase())
      .filter(Boolean),
  );

  let rows = details;
  let added = 0;
  let updated = 0;

  for (const named of naming) {
    const uniqueId = named.uniqueId.trim();
    if (!uniqueId) {
      continue;
    }
    if (completed.has(uniqueId.toLowerCase())) {
      continue;
    }

    const existing = rows.find(
      (row) =>
        row.displayId.trim().toLowerCase() === uniqueId.toLowerCase() ||
        row.namingProjectId === named.id,
    );

    const input = {
      namingProjectId: named.id,
      uniqueId,
      customer: named.customer,
      projectName: named.projectName,
      awardDate: named.awardDate,
    };

    if (!existing) {
      rows = upsertProjectDetailFromNaming(rows, input);
      added += 1;
      continue;
    }

    const needsUpdate =
      existing.displayId.trim() !== uniqueId ||
      existing.customer.trim() !== named.customer.trim() ||
      existing.projectName.trim() !== named.projectName.trim() ||
      existing.projectInitializeDate.trim() !== named.awardDate.trim() ||
      existing.namingProjectId !== named.id;

    if (needsUpdate) {
      rows = upsertProjectDetailFromNaming(rows, input);
      updated += 1;
    }
  }

  return { rows, added, updated };
}
