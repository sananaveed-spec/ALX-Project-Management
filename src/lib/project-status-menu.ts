/** Active Projects Status menu: parents open sub-items; leaf values are saved. */

export type StatusMenuGroup = {
  type: "group";
  label: string;
  children: readonly string[];
};

export type StatusMenuLeaf = {
  type: "leaf";
  value: string;
};

export type StatusMenuEntry = StatusMenuGroup | StatusMenuLeaf;

export const PROJECT_STATUS_MENU: readonly StatusMenuEntry[] = [
  {
    type: "group",
    label: "RFI 1-6",
    children: ["RFI 1", "RFI 2", "RFI 3", "RFI 4", "RFI 5", "RFI 6"],
  },
  {
    type: "group",
    label: "RFI 1-6 Sent",
    children: [
      "RFI 1 Sent",
      "RFI 2 Sent",
      "RFI 3 Sent",
      "RFI 4 Sent",
      "RFI 5 Sent",
      "RFI 6 Sent",
    ],
  },
  {
    type: "group",
    label: "Memo",
    children: [
      "Clarification/RFI Memo",
      "Design Memo",
      "PSS Results Memo",
    ],
  },
  {
    type: "group",
    label: "Memo Sent",
    children: [
      "Clarification/RFI Memo Sent",
      "Design Memo Sent",
      "PSS Results Memo Sent",
    ],
  },
  {
    type: "group",
    label: "Preliminary Report 0-1",
    children: ["Preliminary Report 0", "Preliminary Report 1"],
  },
  {
    type: "group",
    label: "Preliminary Report 0-1 Sent",
    children: ["Preliminary Report 0 Sent", "Preliminary Report 1 Sent"],
  },
  {
    type: "group",
    label: "Final Report 0-1",
    children: [
      "Final Report 0",
      "Final Report 1",
      "Final Report 2",
      "Final Report 3",
      "Final Report 4",
      "Final Report 5",
      "Final Report 6",
      "Final Report 7",
    ],
  },
  {
    type: "group",
    label: "Final Report 0-1 Sent",
    children: [
      "Final Report 0 Sent",
      "Final Report 1 Sent",
      "Final Report 2 Sent",
      "Final Report 3 Sent",
      "Final Report 4 Sent",
      "Final Report 5 Sent",
      "Final Report 6 Sent",
      "Final Report 7 Sent",
    ],
  },
  { type: "leaf", value: "PIN 70" },
  { type: "leaf", value: "PIN 70 Sent" },
  { type: "leaf", value: "Relay Config Report" },
  { type: "leaf", value: "Relay Config Report Sent" },
  { type: "leaf", value: "Client Hold" },
  { type: "leaf", value: "ALX Hold" },
  { type: "leaf", value: "Terminated" },
] as const;

/** Flattened selectable Status values from the new menu (not parents). */
export function projectStatusMenuValues(): string[] {
  const values: string[] = [];
  for (const entry of PROJECT_STATUS_MENU) {
    if (entry.type === "leaf") {
      values.push(entry.value);
    } else {
      values.push(...entry.children);
    }
  }
  return values;
}

export function isProjectStatusMenuValue(status: string): boolean {
  const needle = status.trim().toLowerCase();
  if (!needle) {
    return false;
  }
  return projectStatusMenuValues().some(
    (value) => value.toLowerCase() === needle,
  );
}

export const AC_COURT_ALX = "ALX Court";
export const AC_COURT_CLIENT = "Client Court";

const ALX_COURT_STATUSES = new Set(
  [
    "RFI 1",
    "RFI 2",
    "RFI 3",
    "RFI 4",
    "RFI 5",
    "RFI 6",
    "Clarification/RFI Memo",
    "Design Memo",
    "PSS Results Memo",
    "Preliminary Report 0",
    "Preliminary Report 1",
    "Final Report 0",
    "Final Report 1",
    "Final Report 2",
    "Final Report 3",
    "Final Report 4",
    "Final Report 5",
    "Final Report 6",
    "Final Report 7",
    "PIN 70",
    "Relay Config Report",
    "ALX Hold",
  ].map((value) => value.toLowerCase()),
);

const CLIENT_COURT_STATUSES = new Set(
  [
    "RFI 1 Sent",
    "RFI 2 Sent",
    "RFI 3 Sent",
    "RFI 4 Sent",
    "RFI 5 Sent",
    "RFI 6 Sent",
    "Clarification/RFI Memo Sent",
    "Design Memo Sent",
    "PSS Results Memo Sent",
    "Preliminary Report 0 Sent",
    "Preliminary Report 1 Sent",
    "Final Report 0 Sent",
    "Final Report 1 Sent",
    "Final Report 2 Sent",
    "Final Report 3 Sent",
    "Final Report 4 Sent",
    "Final Report 5 Sent",
    "Final Report 6 Sent",
    "Final Report 7 Sent",
    "PIN 70 Sent",
    "Relay Config Report Sent",
    "Client Hold",
  ].map((value) => value.toLowerCase()),
);

export function isTerminatedStatus(status: string): boolean {
  const normalized = status.trim().replace(/\s+/g, " ");
  return (
    /^terminated$/i.test(normalized) || /^a\.TERMINATED$/i.test(normalized)
  );
}

export type AcCourtResolution =
  | { kind: "auto"; value: string }
  | { kind: "choose" }
  | { kind: "unknown" };

/** Resolve A/C Court from Status (Terminated requires user pick). */
export function resolveAcCourtForStatus(status: string): AcCourtResolution {
  const normalized = status.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { kind: "unknown" };
  }
  if (isTerminatedStatus(normalized)) {
    return { kind: "choose" };
  }
  const key = normalized.toLowerCase();
  if (ALX_COURT_STATUSES.has(key)) {
    return { kind: "auto", value: AC_COURT_ALX };
  }
  if (CLIENT_COURT_STATUSES.has(key)) {
    return { kind: "auto", value: AC_COURT_CLIENT };
  }
  return { kind: "unknown" };
}

/** Display value: saved court, else auto from Status when known. */
export function displayAcCourt(row: {
  status: string;
  acCourt: string;
}): string {
  const saved = row.acCourt.trim();
  if (saved) {
    return saved;
  }
  const resolved = resolveAcCourtForStatus(row.status);
  if (resolved.kind === "auto") {
    return resolved.value;
  }
  return "";
}
