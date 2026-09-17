import {
  todayIsoInLosAngeles,
  type ProjectDetailEntry,
} from "@/lib/project-details";

/** Mirrors Excel Completed Projects columns A–K (labelscheck mapping). */
export type CompletedProjectEntry = {
  id: string;
  displayId: string;
  customer: string;
  projectName: string;
  /** Excel col D — Project Initialize Date from PROJECTS. */
  date: string;
  engineer: string;
  /** Excel col F — from PROJECTS revision history (R). */
  projectHistory: string;
  /** Excel col G — from PROJECTS partial invoicing (S). */
  partialInvoiceDate: string;
  /** Excel col H — from PROJECTS full invoiced (T). */
  invoicedDate: string;
  /** Excel col I — from PROJECTS Final SCCS Sent (U); empty until that field exists. */
  finalReportSentOn: string;
  /** Excel col J — set to today on complete. */
  projectCompleted: string;
  /** Excel col K — Labels Shipped. */
  labelsShipped: string;
  sourceProjectId?: string;
};

export function normalizeCompletedProject(
  raw: Partial<CompletedProjectEntry> & { id: string },
): CompletedProjectEntry {
  return {
    id: raw.id,
    displayId: raw.displayId ?? "",
    customer: raw.customer ?? "",
    projectName: raw.projectName ?? "",
    date: raw.date ?? "",
    engineer: raw.engineer ?? "",
    projectHistory: raw.projectHistory ?? "",
    partialInvoiceDate: raw.partialInvoiceDate ?? "",
    invoicedDate: raw.invoicedDate ?? "",
    finalReportSentOn: raw.finalReportSentOn ?? "",
    projectCompleted: raw.projectCompleted ?? "",
    labelsShipped: raw.labelsShipped ?? "",
    sourceProjectId: raw.sourceProjectId,
  };
}

/** Build Completed Projects row from a PROJECTS row (labelscheck field map). */
export function completedProjectFromDetail(
  row: ProjectDetailEntry,
): CompletedProjectEntry {
  return normalizeCompletedProject({
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    displayId: row.displayId,
    customer: row.customer,
    projectName: row.projectName,
    date: row.projectInitializeDate,
    engineer: row.engineer,
    projectHistory: row.revisionHistory,
    partialInvoiceDate: row.partialInvoicingDate.trim()
      ? row.partialInvoicingDate
      : row.partialInvoiceHistory,
    invoicedDate: row.fullInvoicedDate,
    finalReportSentOn: row.finalSccsSent,
    projectCompleted: todayIsoInLosAngeles(),
    labelsShipped: "",
    sourceProjectId: row.id,
  });
}

export function sortCompletedProjectsNewestFirst(
  rows: CompletedProjectEntry[],
): CompletedProjectEntry[] {
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
