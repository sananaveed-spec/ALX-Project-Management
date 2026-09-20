/**
 * Excel "All project status" — derived from PROJECTS + Completed Projects.
 * Percent + phase buckets mirror sheet formulas (col E / col G).
 */

export type AllProjectStatusRow = {
  id: string;
  displayId: string;
  customer: string;
  projectName: string;
  /** PROJECTS Status, or "Completed" for archived rows. */
  status: string;
  /** 0–1 fraction (Excel stores 0.3, 0.9, …). */
  percent: number | null;
  /** HOLD | Final Report Sent | In Progress */
  phase: string;
  source: "active" | "completed";
};

export const ALL_PROJECT_STATUS_PERCENT_RULES = [
  "Completed → 100%",
  "Final Report Sent (b.Final Report N Sent) → 90%",
  "Preliminary Report Sent / Final Report 1–7 Ready / u.Final Report 1–7 → 60%",
  "Final Report 0 Ready / Preliminary Ready / Memo Sent / u.Final Report 0 → 30%",
  "RFI sent / Kick-off letter sent / Clarification Memo sent → 10%",
  "HOLD / TERMINATED / open RFI / Kick-off letter → 0%",
] as const;

function norm(status: string) {
  return status.trim().replace(/\s+/g, " ");
}

/**
 * Excel All project status col E — IFS / REGEXMATCH on Status.
 * Returns fraction 0–1, or null when Excel leaves the cell blank.
 */
export function percentForProjectStatus(status: string): number | null {
  const s = norm(status);
  if (!s) {
    return null;
  }
  if (/^Completed$/i.test(s)) {
    return 1;
  }
  if (/^w\.Final Report 0 Ready$/i.test(s)) {
    return 0.3;
  }
  if (/^w\.Final Report [1-7] Ready$/i.test(s)) {
    return 0.6;
  }
  if (/^v\.Preliminary Report Ready$/i.test(s)) {
    return 0.3;
  }
  if (/^v\.Preliminary Report rev1 Ready$/i.test(s)) {
    return 0.6;
  }
  if (/^[wu]\.Final Report 0$/i.test(s)) {
    return 0.3;
  }
  if (/^[wu]\.Final Report [1-7]$/i.test(s)) {
    return 0.6;
  }
  if (/^t\.Preliminary Report$/i.test(s)) {
    return 0.3;
  }
  if (/^t\.Preliminary Report rev1$/i.test(s)) {
    return 0.6;
  }
  if (/^[srponq]\.RFI [1-6]$/i.test(s)) {
    return 0;
  }
  if (/^m\.Clarificaton Memo$/i.test(s) || /^m\.Clarification Memo$/i.test(s)) {
    return 0;
  }
  if (/^d\.Clarification Memo sent$/i.test(s)) {
    return 0.1;
  }
  if (/^l\. Memo$/i.test(s) || /^c\. Memo Sent$/i.test(s)) {
    return 0.3;
  }
  if (/^l\.CO Memo$/i.test(s) || /^c\.CO Memo sent$/i.test(s)) {
    return 0.3;
  }
  if (/^k\.Preliminary Report Sent$/i.test(s)) {
    return 0.6;
  }
  if (/^k\.Preliminary Report rev1 Sent$/i.test(s)) {
    return 0.6;
  }
  if (/^k\. Waiting on Equipement aprroval$/i.test(s)) {
    return 0;
  }
  if (/^[jihgfe]\.RFI [1-6] sent$/i.test(s)) {
    return 0.1;
  }
  if (/^a\.HOLD!$/i.test(s) || /^a\.TERMINATED$/i.test(s)) {
    return 0;
  }
  if (/^b\.Final Report [0-7] Sent$/i.test(s)) {
    return 0.9;
  }
  if (/^b\.Final Report Sent$/i.test(s)) {
    return 0.9;
  }
  if (/^c\.Kick-off letter$/i.test(s)) {
    return 0;
  }
  if (/^c\.Kick-off letter sent$/i.test(s)) {
    return 0.1;
  }
  if (/^x\. ALX Court$/i.test(s)) {
    return 0;
  }
  if (/^c\.Recommendation Memo sent$/i.test(s)) {
    return 0.6;
  }
  if (/^l\.Recommendation Memo$/i.test(s) || /^c\.Recommendation M$/i.test(s)) {
    return 0.3;
  }
  if (/^k\. White Paper Sent$/i.test(s)) {
    return 0.6;
  }
  if (/^n\.RFI 1$/i.test(s) || /^o\.RFI 2$/i.test(s)) {
    return 0;
  }
  return null;
}

/**
 * Excel All project status col G — HOLD / Final Report Sent / In Progress.
 * (Sheet spelling is "In Progess"; app uses "In Progress".)
 */
export function phaseForProjectStatus(status: string): string {
  const s = norm(status);
  if (!s) {
    return "In Progress";
  }
  if (/^Completed$/i.test(s)) {
    return "Final Report Sent";
  }
  if (
    /t\.\s*PIN 70 sent/i.test(s) ||
    /^a\.TERMINATED$/i.test(s) ||
    /c\.Recommendation Memo sent/i.test(s) ||
    /^a\.HOLD!$/i.test(s) ||
    /c\.CO Memo sent/i.test(s) ||
    /^c\. Memo Sent$/i.test(s) ||
    /d\.Clarification Memo sent/i.test(s) ||
    /^[e-j]\.RFI [1-6] sent$/i.test(s) ||
    /k\.Preliminary Report Sent/i.test(s) ||
    /v\.Preliminary Report rev0 Sent/i.test(s) ||
    /^w\.Final Report [1-6] Ready$/i.test(s)
  ) {
    return "HOLD";
  }
  if (/^b\.Final Report [0-7] Sent$/i.test(s) || /^b\.Final Report Sent$/i.test(s)) {
    return "Final Report Sent";
  }
  return "In Progress";
}

export function formatStatusPercent(percent: number | null): string {
  if (percent === null || !Number.isFinite(percent)) {
    return "—";
  }
  return `${Math.round(percent * 100)}%`;
}

export function buildAllProjectStatusRows(input: {
  active: Array<{
    id: string;
    displayId: string;
    customer: string;
    projectName: string;
    status: string;
  }>;
  completed: Array<{
    id: string;
    displayId: string;
    customer: string;
    projectName: string;
  }>;
}): AllProjectStatusRow[] {
  const activeRows: AllProjectStatusRow[] = input.active
    .filter((row) => row.displayId.trim())
    .map((row) => {
      const status = row.status.trim();
      return {
        id: `active-${row.id}`,
        displayId: row.displayId.trim(),
        customer: row.customer.trim(),
        projectName: row.projectName.trim(),
        status,
        percent: percentForProjectStatus(status),
        phase: phaseForProjectStatus(status),
        source: "active" as const,
      };
    });

  const activeIds = new Set(
    activeRows.map((row) => row.displayId.toLowerCase()),
  );

  const completedRows: AllProjectStatusRow[] = input.completed
    .filter((row) => {
      const id = row.displayId.trim();
      if (!id) {
        return false;
      }
      return !activeIds.has(id.toLowerCase());
    })
    .map((row) => ({
      id: `completed-${row.id}`,
      displayId: row.displayId.trim(),
      customer: row.customer.trim(),
      projectName: row.projectName.trim(),
      status: "Completed",
      percent: 1,
      phase: "Final Report Sent",
      source: "completed" as const,
    }));

  const combined = [...activeRows, ...completedRows];
  return combined.sort((a, b) =>
    a.displayId.localeCompare(b.displayId, undefined, {
      sensitivity: "base",
      numeric: true,
    }),
  );
}
