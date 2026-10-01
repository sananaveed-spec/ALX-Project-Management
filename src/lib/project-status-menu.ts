/** Active Projects Status menu: parents open sub-items; leaf values are saved. */

export const AC_COURT_ALX = "ALX Court";
export const AC_COURT_CLIENT = "Client Court";

export type StatusCourt =
  | typeof AC_COURT_ALX
  | typeof AC_COURT_CLIENT
  | "choose";

export type StatusMenuChild = {
  id: string;
  value: string;
  court: StatusCourt;
};

export type StatusMenuGroup = {
  id: string;
  type: "group";
  label: string;
  children: StatusMenuChild[];
};

export type StatusMenuLeaf = {
  id: string;
  type: "leaf";
  value: string;
  court: StatusCourt;
};

export type StatusMenuEntry = StatusMenuGroup | StatusMenuLeaf;

function newId(prefix = "status") {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function normalizeCourt(raw: unknown, valueHint = ""): StatusCourt {
  const text = typeof raw === "string" ? raw.trim() : "";
  if (text === AC_COURT_ALX || text === AC_COURT_CLIENT || text === "choose") {
    return text;
  }
  return defaultCourtForValue(valueHint);
}

export function defaultCourtForValue(value: string): StatusCourt {
  const normalized = value.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return AC_COURT_ALX;
  }
  if (
    /^terminated$/i.test(normalized) ||
    /^a\.TERMINATED$/i.test(normalized)
  ) {
    return "choose";
  }
  if (
    /\bsent\b/i.test(normalized) ||
    /^client hold$/i.test(normalized)
  ) {
    return AC_COURT_CLIENT;
  }
  return AC_COURT_ALX;
}

function childFrom(
  value: string,
  court?: StatusCourt,
  id?: string,
): StatusMenuChild {
  return {
    id: id?.trim() || newId("child"),
    value: value.trim(),
    court: court ?? defaultCourtForValue(value),
  };
}

/** Seed menu matching the current Active Projects Status picker. */
export function createDefaultStatusMenu(): StatusMenuEntry[] {
  return [
    {
      id: "group-rfi",
      type: "group",
      label: "RFI 1-6",
      children: ["RFI 1", "RFI 2", "RFI 3", "RFI 4", "RFI 5", "RFI 6"].map(
        (value) => childFrom(value, AC_COURT_ALX),
      ),
    },
    {
      id: "group-rfi-sent",
      type: "group",
      label: "RFI 1-6 Sent",
      children: [
        "RFI 1 Sent",
        "RFI 2 Sent",
        "RFI 3 Sent",
        "RFI 4 Sent",
        "RFI 5 Sent",
        "RFI 6 Sent",
      ].map((value) => childFrom(value, AC_COURT_CLIENT)),
    },
    {
      id: "group-memo",
      type: "group",
      label: "Memo",
      children: [
        "Clarification/RFI Memo",
        "Design Memo",
        "PSS Results Memo",
      ].map((value) => childFrom(value, AC_COURT_ALX)),
    },
    {
      id: "group-memo-sent",
      type: "group",
      label: "Memo Sent",
      children: [
        "Clarification/RFI Memo Sent",
        "Design Memo Sent",
        "PSS Results Memo Sent",
      ].map((value) => childFrom(value, AC_COURT_CLIENT)),
    },
    {
      id: "group-prelim",
      type: "group",
      label: "Preliminary Report 0-1",
      children: ["Preliminary Report 0", "Preliminary Report 1"].map((value) =>
        childFrom(value, AC_COURT_ALX),
      ),
    },
    {
      id: "group-prelim-sent",
      type: "group",
      label: "Preliminary Report 0-2 Sent",
      children: [
        "Preliminary Report 0 Sent",
        "Preliminary Report 1 Sent",
        "Preliminary Report 2 Sent",
      ].map((value) => childFrom(value, AC_COURT_CLIENT)),
    },
    {
      id: "group-final",
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
      ].map((value) => childFrom(value, AC_COURT_ALX)),
    },
    {
      id: "group-final-sent",
      type: "group",
      label: "Final Report 0-7 Sent",
      children: [
        "Final Report 0 Sent",
        "Final Report 1 Sent",
        "Final Report 2 Sent",
        "Final Report 3 Sent",
        "Final Report 4 Sent",
        "Final Report 5 Sent",
        "Final Report 6 Sent",
        "Final Report 7 Sent",
      ].map((value) => childFrom(value, AC_COURT_CLIENT)),
    },
    {
      id: "leaf-pin-70",
      type: "leaf",
      value: "PIN 70",
      court: AC_COURT_ALX,
    },
    {
      id: "leaf-pin-70-sent",
      type: "leaf",
      value: "PIN 70 Sent",
      court: AC_COURT_CLIENT,
    },
    {
      id: "leaf-relay",
      type: "leaf",
      value: "Relay Config Report",
      court: AC_COURT_ALX,
    },
    {
      id: "leaf-relay-sent",
      type: "leaf",
      value: "Relay Config Report Sent",
      court: AC_COURT_CLIENT,
    },
    {
      id: "leaf-client-hold",
      type: "leaf",
      value: "Client Hold",
      court: AC_COURT_CLIENT,
    },
    {
      id: "leaf-alx-hold",
      type: "leaf",
      value: "ALX Hold",
      court: AC_COURT_ALX,
    },
    {
      id: "leaf-terminated",
      type: "leaf",
      value: "Terminated",
      court: "choose",
    },
  ];
}

/** @deprecated Use createDefaultStatusMenu() / loaded menu. Kept for fallback. */
export const PROJECT_STATUS_MENU: StatusMenuEntry[] = createDefaultStatusMenu();

export function normalizeStatusMenuChild(
  raw: Partial<StatusMenuChild> & { value?: string },
): StatusMenuChild | null {
  const value = (raw.value ?? "").trim();
  if (!value) {
    return null;
  }
  return {
    id: typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : newId("child"),
    value,
    court: normalizeCourt(raw.court, value),
  };
}

export function normalizeStatusMenuEntry(
  raw: Partial<StatusMenuEntry> & { type?: string },
): StatusMenuEntry | null {
  const id =
    typeof raw.id === "string" && raw.id.trim() ? raw.id.trim() : newId();

  if (raw.type === "leaf") {
    const value = (raw as StatusMenuLeaf).value?.trim() ?? "";
    if (!value) {
      return null;
    }
    return {
      id,
      type: "leaf",
      value,
      court: normalizeCourt((raw as StatusMenuLeaf).court, value),
    };
  }

  if (raw.type === "group") {
    const label = (raw as StatusMenuGroup).label?.trim() ?? "";
    if (!label) {
      return null;
    }
    const childrenRaw = Array.isArray((raw as StatusMenuGroup).children)
      ? (raw as StatusMenuGroup).children
      : [];
    const children = childrenRaw
      .map((child) => {
        if (typeof child === "string") {
          return normalizeStatusMenuChild({ value: child });
        }
        return normalizeStatusMenuChild(child as Partial<StatusMenuChild>);
      })
      .filter((child): child is StatusMenuChild => child !== null);

    return {
      id,
      type: "group",
      label,
      children,
    };
  }

  return null;
}

export function normalizeStatusMenu(raw: unknown): StatusMenuEntry[] {
  if (!Array.isArray(raw)) {
    return createDefaultStatusMenu();
  }
  const entries = raw
    .map((item) =>
      typeof item === "object" && item !== null
        ? normalizeStatusMenuEntry(item as Partial<StatusMenuEntry>)
        : null,
    )
    .filter((item): item is StatusMenuEntry => item !== null);
  return entries.length > 0 ? entries : createDefaultStatusMenu();
}

/** Flattened selectable Status values from the menu (not parents). */
export function projectStatusMenuValues(
  menu: StatusMenuEntry[] = PROJECT_STATUS_MENU,
): string[] {
  const values: string[] = [];
  for (const entry of menu) {
    if (entry.type === "leaf") {
      values.push(entry.value);
    } else {
      values.push(...entry.children.map((child) => child.value));
    }
  }
  return values;
}

export function isProjectStatusMenuValue(
  status: string,
  menu: StatusMenuEntry[] = PROJECT_STATUS_MENU,
): boolean {
  const needle = status.trim().toLowerCase();
  if (!needle) {
    return false;
  }
  return projectStatusMenuValues(menu).some(
    (value) => value.toLowerCase() === needle,
  );
}

export function buildCourtLookup(
  menu: StatusMenuEntry[],
): Map<string, StatusCourt> {
  const map = new Map<string, StatusCourt>();
  for (const entry of menu) {
    if (entry.type === "leaf") {
      map.set(entry.value.trim().toLowerCase(), entry.court);
    } else {
      for (const child of entry.children) {
        map.set(child.value.trim().toLowerCase(), child.court);
      }
    }
  }
  return map;
}

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

/** Resolve A/C Court from Status (Terminated / court=choose requires user pick). */
export function resolveAcCourtForStatus(
  status: string,
  menu: StatusMenuEntry[] = PROJECT_STATUS_MENU,
): AcCourtResolution {
  const normalized = status.trim().replace(/\s+/g, " ");
  if (!normalized) {
    return { kind: "unknown" };
  }
  if (isTerminatedStatus(normalized)) {
    return { kind: "choose" };
  }
  const court = buildCourtLookup(menu).get(normalized.toLowerCase());
  if (!court) {
    return { kind: "unknown" };
  }
  if (court === "choose") {
    return { kind: "choose" };
  }
  return { kind: "auto", value: court };
}

/** Display value: saved court, else auto from Status when known. */
export function displayAcCourt(
  row: {
    status: string;
    acCourt: string;
  },
  menu: StatusMenuEntry[] = PROJECT_STATUS_MENU,
): string {
  const saved = row.acCourt.trim();
  if (saved) {
    return saved;
  }
  const resolved = resolveAcCourtForStatus(row.status, menu);
  if (resolved.kind === "auto") {
    return resolved.value;
  }
  return "";
}

export function createStatusGroup(label: string): StatusMenuGroup {
  return {
    id: newId("group"),
    type: "group",
    label: label.trim(),
    children: [],
  };
}

export function createStatusLeaf(
  value: string,
  court?: StatusCourt,
): StatusMenuLeaf {
  const trimmed = value.trim();
  return {
    id: newId("leaf"),
    type: "leaf",
    value: trimmed,
    court: court ?? defaultCourtForValue(trimmed),
  };
}

export function createStatusChild(
  value: string,
  court?: StatusCourt,
): StatusMenuChild {
  return childFrom(value, court);
}
