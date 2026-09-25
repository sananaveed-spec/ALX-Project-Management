"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import type { CustomerEntry } from "@/lib/customers";
import {
  buildProjectExportRows,
  exportProjectsAsCsv,
  exportProjectsAsExcel,
  exportProjectsAsPdf,
} from "@/lib/projects-export";
import {
  isFinalReportSentStatus,
  isFullyInvoiced,
  isReadyToInvoice,
  READY_TO_INVOICE_VALUE,
  remainingInvoicePercent,
  reminderFieldsForStatus,
  todayIsoInLosAngeles,
  todayMmDdYyyyInLosAngeles,
  type ProjectDetailEntry,
} from "@/lib/project-details";

const PAGE_SIZE = 50;

const PROJECT_STATUS_OPTIONS = [
  "a.HOLD!",
  "a.TERMINATED",
  "b.Final Report Sent",
  "b.Final Report 0 Sent",
  "b.Final Report 1 Sent",
  "b.Final Report 2 Sent",
  "b.Final Report 3 Sent",
  "c. Memo Sent",
  "c.Recommendation M",
  "e.RFI 1 sent",
  "f.RFI 2 sent",
  "g.RFI 3 sent",
  "k.Preliminary Report",
  "k.Preliminary Report Sent",
  "n.RFI 1",
  "o.RFI 2",
  "t. PIN 70 sent",
  "t.Preliminary Report",
  "u. Relay Config Report",
  "u.Final Report 0",
  "u.Final Report 1",
  "v.Preliminary Report Ready",
  "w.Final Report Ready",
  "w.Final Report 0 Ready",
  "w.Final Report 1 Ready",
  "w.Final Report 2 Ready",
  "w.Final Report 3 Ready",
  "w.Final Report 4 Ready",
  "w.Final Report 5 Ready",
  "w.Final Report 6 Ready",
  "w.Final Report 7 Ready",
  "zStatus",
  "Final Report 0 Ready",
  "Final Report 1 Ready",
  "Final Report 2 Ready",
  "Final Report 3 Ready",
  "RFI 3 sent",
  "RFI-4 sent",
  "RFI-6 sent",
  "Final report rev7 sent",
  "Preliminary report sent",
  "Final report 4 sent",
] as const;

const PROJECT_INVOICED_OPTIONS = [
  "FULL",
  "PARTIAL",
  "NO",
  READY_TO_INVOICE_VALUE,
  "INVOICED",
] as const;

const PROJECT_PRIORITY_OPTIONS = [
  "Very High",
  "High",
  "Medium",
  "Low",
] as const;

const PROJECT_TABLE_HEADERS = [
  "ID",
  "Customer",
  "Project Name",
  "Project Initialize Date",
  "Engineer",
  "PM Name",
  "Status",
  "Invoiced",
  "Recent Activity",
  "Date",
  "Pm Action Items",
  "Date",
  "Last Email Received (Client)",
  "Date",
  "Project Completed",
  "Priority",
  "ETA(days)",
  "Revision History",
  "Partial Invoicing Date",
  "Full Invoiced Date",
  "PM Comments",
  "Final SCCS Sent",
] as const;

type MultilineField =
  | "recentActivity"
  | "pmActionItems"
  | "lastEmailReceivedClient"
  | "revisionHistory"
  | "pmComments"
  | "partialInvoiceHistory"
  | "fullInvoicedDate";

type EditableField =
  | "engineer"
  | "status"
  | "invoiced"
  | "priority"
  | "etaDays"
  | MultilineField
  | "recentActivityDate"
  | "pmActionItemsDate"
  | "lastEmailReceivedDate"
  | "finalSccsSent";

type MultilineEditorState = {
  rowId: string;
  field: MultilineField;
  label: string;
  projectLabel: string;
  draft: string;
};

type CompleteConfirmState = {
  rowId: string;
  projectLabel: string;
};

type PmCommentsPromptState = {
  rowId: string;
  projectLabel: string;
  draft: string;
};

type StatusPmActionPromptState = {
  rowId: string;
  projectLabel: string;
  previousStatus: string;
  nextStatus: string;
  pmActionItems: string;
  pmActionItemsDate: string;
  /** Shown for k.Preliminary Report Sent — drives reminder date. */
  followUpDays: string;
  showFollowUpDays: boolean;
};

function cell(value: string) {
  return value.trim() ? value : "—";
}

function savingKeyFor(rowId: string, field: EditableField) {
  return `${rowId}:${field}`;
}

function previewText(value: string) {
  const trimmed = value.replace(/\s+$/g, "");
  if (!trimmed.trim()) {
    return "";
  }
  return trimmed;
}

/** Example: 7/14/2026, 4:12:45 AM (America/Los_Angeles). */
function formatRevisionTimestamp(date = new Date()) {
  const datePart = date.toLocaleDateString("en-US", {
    timeZone: "America/Los_Angeles",
    month: "numeric",
    day: "numeric",
    year: "numeric",
  });
  const timePart = date.toLocaleTimeString("en-US", {
    timeZone: "America/Los_Angeles",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  return `${datePart}, ${timePart}`;
}

function appendStatusRevision(existing: string, status: string) {
  const entry = `${status.trim()} - ${formatRevisionTimestamp()}`;
  const current = existing.replace(/\s+$/g, "");
  return current ? `${current}\n${entry}` : entry;
}

function isPreliminaryReportSentStatus(status: string) {
  return /^k\.Preliminary Report Sent$/i.test(
    status.trim().replace(/\s+/g, " "),
  );
}

function addDaysIso(days: number, from = new Date()) {
  const date = new Date(from);
  date.setDate(date.getDate() + days);
  return todayIsoInLosAngeles(date);
}

function matchesCustomerFilter(customer: CustomerEntry, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return (
    customer.customerId.toLowerCase().includes(q) ||
    customer.customerName.toLowerCase().includes(q)
  );
}

type AtsUser = {
  id: string;
  name: string;
  email: string;
};

function matchesEngineerFilter(user: AtsUser, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return (
    user.name.toLowerCase().includes(q) ||
    user.email.toLowerCase().includes(q)
  );
}

function matchesStatusFilter(status: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return status.toLowerCase().includes(q);
}

function matchesInvoicedFilter(invoiced: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return invoiced.toLowerCase().includes(q);
}

function matchesPriorityFilter(priority: string, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return priority.toLowerCase().includes(q);
}

export function ProjectsPanel() {
  const [rows, setRows] = useState<ProjectDetailEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  /** UniqueID → engineer from Project Naming (source of truth for display). */
  const [namingEngineerByUniqueId, setNamingEngineerByUniqueId] = useState<
    Record<string, string>
  >({});
  /** UniqueID → PM name from Project Naming (source of truth for display). */
  const [namingPmByUniqueId, setNamingPmByUniqueId] = useState<
    Record<string, string>
  >({});
  const [customers, setCustomers] = useState<CustomerEntry[]>([]);
  const [customerSearch, setCustomerSearch] = useState("");
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [customerDropdownOpen, setCustomerDropdownOpen] = useState(false);
  const [atsUsers, setAtsUsers] = useState<AtsUser[]>([]);
  const [engineerSearch, setEngineerSearch] = useState("");
  const [selectedEngineerNames, setSelectedEngineerNames] = useState<string[]>(
    [],
  );
  const [engineerDropdownOpen, setEngineerDropdownOpen] = useState(false);
  const [pmSearch, setPmSearch] = useState("");
  const [selectedPmNames, setSelectedPmNames] = useState<string[]>([]);
  const [pmDropdownOpen, setPmDropdownOpen] = useState(false);
  const [statusSearch, setStatusSearch] = useState("");
  const [selectedStatuses, setSelectedStatuses] = useState<string[]>([]);
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);
  const [invoicedSearch, setInvoicedSearch] = useState("");
  const [selectedInvoiced, setSelectedInvoiced] = useState<string[]>([]);
  const [invoicedDropdownOpen, setInvoicedDropdownOpen] = useState(false);
  const [prioritySearch, setPrioritySearch] = useState("");
  const [selectedPriorities, setSelectedPriorities] = useState<string[]>([]);
  const [priorityDropdownOpen, setPriorityDropdownOpen] = useState(false);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [multilineEditor, setMultilineEditor] =
    useState<MultilineEditorState | null>(null);
  const [completeConfirm, setCompleteConfirm] =
    useState<CompleteConfirmState | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [pmCommentsPrompt, setPmCommentsPrompt] =
    useState<PmCommentsPromptState | null>(null);
  const [statusPmPrompt, setStatusPmPrompt] =
    useState<StatusPmActionPromptState | null>(null);
  const [mounted, setMounted] = useState(false);
  const persistedRowsRef = useRef<ProjectDetailEntry[]>([]);
  const customerFilterRef = useRef<HTMLDivElement | null>(null);
  const customerSearchRef = useRef<HTMLInputElement | null>(null);
  const engineerFilterRef = useRef<HTMLDivElement | null>(null);
  const engineerSearchRef = useRef<HTMLInputElement | null>(null);
  const pmFilterRef = useRef<HTMLDivElement | null>(null);
  const pmSearchRef = useRef<HTMLInputElement | null>(null);
  const statusFilterRef = useRef<HTMLDivElement | null>(null);
  const statusSearchRef = useRef<HTMLInputElement | null>(null);
  const invoicedFilterRef = useRef<HTMLDivElement | null>(null);
  const invoicedSearchRef = useRef<HTMLInputElement | null>(null);
  const priorityFilterRef = useRef<HTMLDivElement | null>(null);
  const prioritySearchRef = useRef<HTMLInputElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const editorTitleId = useId();
  const completeTitleId = useId();
  const pmCommentsTitleId = useId();
  const statusPmTitleId = useId();
  const customerListId = useId();
  const engineerListId = useId();
  const pmListId = useId();
  const statusListId = useId();
  const invoicedListId = useId();
  const priorityListId = useId();
  const exportMenuId = useId();
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const pmCommentsTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const statusPmTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      try {
        const response = await fetch("/api/project-details");
        if (!response.ok) {
          throw new Error("Could not load projects.");
        }
        const data = (await response.json()) as {
          projectDetails?: ProjectDetailEntry[];
        };
        if (!cancelled) {
          const next = data.projectDetails ?? [];
          persistedRowsRef.current = next;
          setRows(next);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load projects.",
          );
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void loadRows();
    return () => {
      cancelled = true;
    };
  }, []);

  // Lock fully invoiced projects as FULL (heal READY/PARTIAL that already hit 100%).
  useEffect(() => {
    if (!ready) {
      return;
    }
    const snapshot = persistedRowsRef.current;
    const stale = snapshot.filter(
      (row) =>
        isFullyInvoiced(row) && row.invoiced.trim().toUpperCase() !== "FULL",
    );
    if (stale.length === 0) {
      return;
    }

    let cancelled = false;

    async function healFullyInvoiced() {
      let working = persistedRowsRef.current;
      for (const row of stale) {
        if (cancelled) {
          return;
        }
        const patch = { id: row.id, invoiced: "FULL" };
        const toSave = working.map((item) =>
          item.id === row.id ? { ...item, invoiced: "FULL" } : item,
        );
        try {
          const response = await fetch("/api/project-details", {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ projectDetail: patch }),
          });
          if (!response.ok) {
            continue;
          }
          const data = (await response.json()) as {
            projectDetail?: ProjectDetailEntry;
          };
          working = data.projectDetail
            ? toSave.map((item) =>
                item.id === row.id ? data.projectDetail! : item,
              )
            : toSave;
          persistedRowsRef.current = working;
          if (!cancelled) {
            setRows(working);
          }
        } catch {
          // leave row as-is; UI still shows FULL locked
        }
      }
    }

    void healFullyInvoiced();
    return () => {
      cancelled = true;
    };
  }, [ready]);

  useEffect(() => {
    let cancelled = false;

    async function loadNamingEngineers() {
      try {
        const response = await fetch("/api/projects", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Could not load Project Naming engineers.");
        }
        const data = (await response.json()) as {
          projects?: Array<{
            id?: string;
            uniqueId?: string;
            engineer?: string;
            pmName?: string;
          }>;
        };
        if (!cancelled) {
          const engineerByUniqueId: Record<string, string> = {};
          const pmByUniqueId: Record<string, string> = {};
          for (const project of data.projects ?? []) {
            const uniqueId = project.uniqueId?.trim() ?? "";
            if (!uniqueId) {
              continue;
            }
            const key = uniqueId.toLowerCase();
            const engineer = project.engineer?.trim() ?? "";
            if (engineer) {
              engineerByUniqueId[key] = engineer;
            }
            const pmName = project.pmName?.trim() ?? "";
            if (pmName) {
              pmByUniqueId[key] = pmName;
            }
          }
          setNamingEngineerByUniqueId(engineerByUniqueId);
          setNamingPmByUniqueId(pmByUniqueId);
        }
      } catch {
        if (!cancelled) {
          setNamingEngineerByUniqueId({});
          setNamingPmByUniqueId({});
        }
      }
    }

    void loadNamingEngineers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadCustomers() {
      try {
        const response = await fetch("/api/customers", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Could not load customers.");
        }
        const data = (await response.json()) as {
          customers?: CustomerEntry[];
        };
        if (!cancelled) {
          setCustomers(data.customers ?? []);
        }
      } catch {
        if (!cancelled) {
          setCustomers([]);
        }
      }
    }

    void loadCustomers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadAtsUsers() {
      try {
        const response = await fetch("/api/timesheets/users", {
          cache: "no-store",
        });
        const data = (await response.json()) as {
          users?: AtsUser[];
        };
        if (!cancelled) {
          setAtsUsers(data.users ?? []);
        }
      } catch {
        if (!cancelled) {
          setAtsUsers([]);
        }
      }
    }

    void loadAtsUsers();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (
      !customerDropdownOpen &&
      !engineerDropdownOpen &&
      !pmDropdownOpen &&
      !statusDropdownOpen &&
      !invoicedDropdownOpen &&
      !priorityDropdownOpen &&
      !exportDropdownOpen
    ) {
      return;
    }

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node | null;
      if (!target) {
        return;
      }
      if (
        customerDropdownOpen &&
        customerFilterRef.current &&
        !customerFilterRef.current.contains(target)
      ) {
        setCustomerDropdownOpen(false);
      }
      if (
        engineerDropdownOpen &&
        engineerFilterRef.current &&
        !engineerFilterRef.current.contains(target)
      ) {
        setEngineerDropdownOpen(false);
      }
      if (
        pmDropdownOpen &&
        pmFilterRef.current &&
        !pmFilterRef.current.contains(target)
      ) {
        setPmDropdownOpen(false);
      }
      if (
        statusDropdownOpen &&
        statusFilterRef.current &&
        !statusFilterRef.current.contains(target)
      ) {
        setStatusDropdownOpen(false);
      }
      if (
        invoicedDropdownOpen &&
        invoicedFilterRef.current &&
        !invoicedFilterRef.current.contains(target)
      ) {
        setInvoicedDropdownOpen(false);
      }
      if (
        priorityDropdownOpen &&
        priorityFilterRef.current &&
        !priorityFilterRef.current.contains(target)
      ) {
        setPriorityDropdownOpen(false);
      }
      if (
        exportDropdownOpen &&
        exportMenuRef.current &&
        !exportMenuRef.current.contains(target)
      ) {
        setExportDropdownOpen(false);
      }
    }

    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") {
        setCustomerDropdownOpen(false);
        setEngineerDropdownOpen(false);
        setPmDropdownOpen(false);
        setStatusDropdownOpen(false);
        setInvoicedDropdownOpen(false);
        setPriorityDropdownOpen(false);
        setExportDropdownOpen(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [
    customerDropdownOpen,
    engineerDropdownOpen,
    pmDropdownOpen,
    statusDropdownOpen,
    invoicedDropdownOpen,
    priorityDropdownOpen,
    exportDropdownOpen,
  ]);

  useEffect(() => {
    if (!customerDropdownOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      customerSearchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [customerDropdownOpen]);

  useEffect(() => {
    if (!engineerDropdownOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      engineerSearchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [engineerDropdownOpen]);

  useEffect(() => {
    if (!pmDropdownOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      pmSearchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pmDropdownOpen]);

  useEffect(() => {
    if (!statusDropdownOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      statusSearchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [statusDropdownOpen]);

  useEffect(() => {
    if (!invoicedDropdownOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      invoicedSearchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [invoicedDropdownOpen]);

  useEffect(() => {
    if (!priorityDropdownOpen) {
      return;
    }
    const timer = window.setTimeout(() => {
      prioritySearchRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [priorityDropdownOpen]);

  function engineerFromNaming(row: ProjectDetailEntry) {
    const fromNaming =
      namingEngineerByUniqueId[row.displayId.trim().toLowerCase()];
    if (fromNaming?.trim()) {
      return fromNaming.trim();
    }
    return row.engineer.trim();
  }

  function pmNameFromNaming(row: ProjectDetailEntry) {
    const fromNaming = namingPmByUniqueId[row.displayId.trim().toLowerCase()];
    if (fromNaming?.trim()) {
      return fromNaming.trim();
    }
    return row.pmName.trim();
  }

  const customerOptions = useMemo(() => {
    const byId = new Map<string, CustomerEntry>();
    for (const customer of customers) {
      const id = customer.customerId.trim();
      if (id) {
        byId.set(id.toLowerCase(), customer);
      }
    }
    for (const row of rows) {
      const id = row.customer.trim();
      if (!id) {
        continue;
      }
      const key = id.toLowerCase();
      if (!byId.has(key)) {
        byId.set(key, {
          id: `row-customer-${key}`,
          customerId: id,
          customerName: "",
          email: "",
          pocName: "",
          pocEmail: "",
          billToAddress: "",
          apNumber: "",
        });
      }
    }
    return [...byId.values()].sort((a, b) =>
      a.customerId.localeCompare(b.customerId, undefined, {
        sensitivity: "base",
      }),
    );
  }, [customers, rows]);

  const customerMatches = useMemo(
    () =>
      customerOptions.filter((customer) =>
        matchesCustomerFilter(customer, customerSearch),
      ),
    [customerOptions, customerSearch],
  );

  const selectedCustomerIdSet = useMemo(
    () => new Set(selectedCustomerIds.map((id) => id.toLowerCase())),
    [selectedCustomerIds],
  );

  const allVisibleCustomersSelected =
    customerMatches.length > 0 &&
    customerMatches.every((customer) =>
      selectedCustomerIdSet.has(customer.customerId.trim().toLowerCase()),
    );

  const engineerOptions = useMemo(
    () =>
      [...atsUsers]
        .filter((user) => user.name.trim())
        .sort((a, b) =>
          a.name.localeCompare(b.name, undefined, { sensitivity: "base" }),
        ),
    [atsUsers],
  );

  const engineerMatches = useMemo(
    () =>
      engineerOptions.filter((user) =>
        matchesEngineerFilter(user, engineerSearch),
      ),
    [engineerOptions, engineerSearch],
  );

  const selectedEngineerNameSet = useMemo(
    () => new Set(selectedEngineerNames.map((name) => name.toLowerCase())),
    [selectedEngineerNames],
  );

  const allVisibleEngineersSelected =
    engineerMatches.length > 0 &&
    engineerMatches.every((user) =>
      selectedEngineerNameSet.has(user.name.trim().toLowerCase()),
    );

  const pmMatches = useMemo(
    () =>
      engineerOptions.filter((user) =>
        matchesEngineerFilter(user, pmSearch),
      ),
    [engineerOptions, pmSearch],
  );

  const selectedPmNameSet = useMemo(
    () => new Set(selectedPmNames.map((name) => name.toLowerCase())),
    [selectedPmNames],
  );

  const allVisiblePmsSelected =
    pmMatches.length > 0 &&
    pmMatches.every((user) =>
      selectedPmNameSet.has(user.name.trim().toLowerCase()),
    );

  const statusOptions = useMemo(() => {
    const options = new Set<string>(PROJECT_STATUS_OPTIONS);
    for (const row of rows) {
      if (row.status.trim()) {
        options.add(row.status.trim());
      }
    }
    return [...options].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [rows]);

  const statusMatches = useMemo(
    () =>
      statusOptions.filter((status) =>
        matchesStatusFilter(status, statusSearch),
      ),
    [statusOptions, statusSearch],
  );

  const selectedStatusSet = useMemo(
    () => new Set(selectedStatuses.map((status) => status.toLowerCase())),
    [selectedStatuses],
  );

  const allVisibleStatusesSelected =
    statusMatches.length > 0 &&
    statusMatches.every((status) =>
      selectedStatusSet.has(status.toLowerCase()),
    );

  const invoicedOptions = useMemo(() => {
    const options = new Set<string>(PROJECT_INVOICED_OPTIONS);
    for (const row of rows) {
      if (row.invoiced.trim()) {
        options.add(row.invoiced.trim());
      }
    }
    return [...options].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [rows]);

  const invoicedMatches = useMemo(
    () =>
      invoicedOptions.filter((invoiced) =>
        matchesInvoicedFilter(invoiced, invoicedSearch),
      ),
    [invoicedOptions, invoicedSearch],
  );

  const selectedInvoicedSet = useMemo(
    () => new Set(selectedInvoiced.map((value) => value.toLowerCase())),
    [selectedInvoiced],
  );

  const allVisibleInvoicedSelected =
    invoicedMatches.length > 0 &&
    invoicedMatches.every((invoiced) =>
      selectedInvoicedSet.has(invoiced.toLowerCase()),
    );

  const priorityOptions = useMemo(() => {
    const options = new Set<string>(PROJECT_PRIORITY_OPTIONS);
    for (const row of rows) {
      if (row.priority.trim()) {
        options.add(row.priority.trim());
      }
    }
    return [...options].sort((a, b) =>
      a.localeCompare(b, undefined, { sensitivity: "base" }),
    );
  }, [rows]);

  const priorityMatches = useMemo(
    () =>
      priorityOptions.filter((priority) =>
        matchesPriorityFilter(priority, prioritySearch),
      ),
    [priorityOptions, prioritySearch],
  );

  const selectedPrioritySet = useMemo(
    () => new Set(selectedPriorities.map((value) => value.toLowerCase())),
    [selectedPriorities],
  );

  const allVisiblePrioritiesSelected =
    priorityMatches.length > 0 &&
    priorityMatches.every((priority) =>
      selectedPrioritySet.has(priority.toLowerCase()),
    );

  const filteredRows = useMemo(() => {
    return rows.filter((row) => {
      if (
        selectedCustomerIds.length > 0 &&
        !selectedCustomerIdSet.has(row.customer.trim().toLowerCase())
      ) {
        return false;
      }
      if (selectedEngineerNames.length > 0) {
        const engineer = engineerFromNaming(row).toLowerCase();
        if (!engineer || !selectedEngineerNameSet.has(engineer)) {
          return false;
        }
      }
      if (selectedPmNames.length > 0) {
        const pm = pmNameFromNaming(row).toLowerCase();
        if (!pm || !selectedPmNameSet.has(pm)) {
          return false;
        }
      }
      if (selectedStatuses.length > 0) {
        const status = row.status.trim().toLowerCase();
        if (!status || !selectedStatusSet.has(status)) {
          return false;
        }
      }
      if (selectedInvoiced.length > 0) {
        const invoiced = row.invoiced.trim().toLowerCase();
        if (!invoiced || !selectedInvoicedSet.has(invoiced)) {
          return false;
        }
      }
      if (selectedPriorities.length > 0) {
        const priority = row.priority.trim().toLowerCase();
        if (!priority || !selectedPrioritySet.has(priority)) {
          return false;
        }
      }
      return true;
    });
  }, [
    rows,
    selectedCustomerIds,
    selectedCustomerIdSet,
    selectedEngineerNames,
    selectedEngineerNameSet,
    selectedPmNames,
    selectedPmNameSet,
    selectedStatuses,
    selectedStatusSet,
    selectedInvoiced,
    selectedInvoicedSet,
    selectedPriorities,
    selectedPrioritySet,
    namingEngineerByUniqueId,
    namingPmByUniqueId,
  ]);

  useEffect(() => {
    setPage(1);
  }, [
    selectedCustomerIds,
    selectedEngineerNames,
    selectedPmNames,
    selectedStatuses,
    selectedInvoiced,
    selectedPriorities,
  ]);

  function toggleCustomerId(customerId: string) {
    const id = customerId.trim();
    if (!id) {
      return;
    }
    const key = id.toLowerCase();
    setSelectedCustomerIds((current) => {
      const exists = current.some((item) => item.toLowerCase() === key);
      if (exists) {
        return current.filter((item) => item.toLowerCase() !== key);
      }
      return [...current, id];
    });
  }

  function toggleSelectAllCustomersVisible() {
    const visibleIds = customerMatches
      .map((customer) => customer.customerId.trim())
      .filter(Boolean);
    if (visibleIds.length === 0) {
      return;
    }
    if (allVisibleCustomersSelected) {
      const visibleKeys = new Set(visibleIds.map((id) => id.toLowerCase()));
      setSelectedCustomerIds((current) =>
        current.filter((id) => !visibleKeys.has(id.toLowerCase())),
      );
      return;
    }
    setSelectedCustomerIds((current) => {
      const next = [...current];
      const existing = new Set(current.map((id) => id.toLowerCase()));
      for (const id of visibleIds) {
        if (!existing.has(id.toLowerCase())) {
          next.push(id);
          existing.add(id.toLowerCase());
        }
      }
      return next;
    });
  }

  function clearCustomerFilter() {
    setSelectedCustomerIds([]);
    setCustomerSearch("");
  }

  function toggleEngineerName(name: string) {
    const value = name.trim();
    if (!value) {
      return;
    }
    const key = value.toLowerCase();
    setSelectedEngineerNames((current) => {
      const exists = current.some((item) => item.toLowerCase() === key);
      if (exists) {
        return current.filter((item) => item.toLowerCase() !== key);
      }
      return [...current, value];
    });
  }

  function toggleSelectAllEngineersVisible() {
    const visibleNames = engineerMatches
      .map((user) => user.name.trim())
      .filter(Boolean);
    if (visibleNames.length === 0) {
      return;
    }
    if (allVisibleEngineersSelected) {
      const visibleKeys = new Set(visibleNames.map((name) => name.toLowerCase()));
      setSelectedEngineerNames((current) =>
        current.filter((name) => !visibleKeys.has(name.toLowerCase())),
      );
      return;
    }
    setSelectedEngineerNames((current) => {
      const next = [...current];
      const existing = new Set(current.map((name) => name.toLowerCase()));
      for (const name of visibleNames) {
        if (!existing.has(name.toLowerCase())) {
          next.push(name);
          existing.add(name.toLowerCase());
        }
      }
      return next;
    });
  }

  function clearEngineerFilter() {
    setSelectedEngineerNames([]);
    setEngineerSearch("");
  }

  function togglePmName(name: string) {
    const value = name.trim();
    if (!value) {
      return;
    }
    const key = value.toLowerCase();
    setSelectedPmNames((current) => {
      const exists = current.some((item) => item.toLowerCase() === key);
      if (exists) {
        return current.filter((item) => item.toLowerCase() !== key);
      }
      return [...current, value];
    });
  }

  function toggleSelectAllPmsVisible() {
    const visibleNames = pmMatches
      .map((user) => user.name.trim())
      .filter(Boolean);
    if (visibleNames.length === 0) {
      return;
    }
    if (allVisiblePmsSelected) {
      const visibleKeys = new Set(
        visibleNames.map((name) => name.toLowerCase()),
      );
      setSelectedPmNames((current) =>
        current.filter((name) => !visibleKeys.has(name.toLowerCase())),
      );
      return;
    }
    setSelectedPmNames((current) => {
      const next = [...current];
      const existing = new Set(current.map((name) => name.toLowerCase()));
      for (const name of visibleNames) {
        if (!existing.has(name.toLowerCase())) {
          next.push(name);
          existing.add(name.toLowerCase());
        }
      }
      return next;
    });
  }

  function clearPmFilter() {
    setSelectedPmNames([]);
    setPmSearch("");
  }

  function toggleStatus(status: string) {
    const value = status.trim();
    if (!value) {
      return;
    }
    const key = value.toLowerCase();
    setSelectedStatuses((current) => {
      const exists = current.some((item) => item.toLowerCase() === key);
      if (exists) {
        return current.filter((item) => item.toLowerCase() !== key);
      }
      return [...current, value];
    });
  }

  function toggleSelectAllStatusesVisible() {
    const visibleStatuses = statusMatches.map((status) => status.trim()).filter(Boolean);
    if (visibleStatuses.length === 0) {
      return;
    }
    if (allVisibleStatusesSelected) {
      const visibleKeys = new Set(
        visibleStatuses.map((status) => status.toLowerCase()),
      );
      setSelectedStatuses((current) =>
        current.filter((status) => !visibleKeys.has(status.toLowerCase())),
      );
      return;
    }
    setSelectedStatuses((current) => {
      const next = [...current];
      const existing = new Set(current.map((status) => status.toLowerCase()));
      for (const status of visibleStatuses) {
        if (!existing.has(status.toLowerCase())) {
          next.push(status);
          existing.add(status.toLowerCase());
        }
      }
      return next;
    });
  }

  function clearStatusFilter() {
    setSelectedStatuses([]);
    setStatusSearch("");
  }

  function toggleInvoiced(invoiced: string) {
    const value = invoiced.trim();
    if (!value) {
      return;
    }
    const key = value.toLowerCase();
    setSelectedInvoiced((current) => {
      const exists = current.some((item) => item.toLowerCase() === key);
      if (exists) {
        return current.filter((item) => item.toLowerCase() !== key);
      }
      return [...current, value];
    });
  }

  function toggleSelectAllInvoicedVisible() {
    const visibleValues = invoicedMatches
      .map((invoiced) => invoiced.trim())
      .filter(Boolean);
    if (visibleValues.length === 0) {
      return;
    }
    if (allVisibleInvoicedSelected) {
      const visibleKeys = new Set(
        visibleValues.map((value) => value.toLowerCase()),
      );
      setSelectedInvoiced((current) =>
        current.filter((value) => !visibleKeys.has(value.toLowerCase())),
      );
      return;
    }
    setSelectedInvoiced((current) => {
      const next = [...current];
      const existing = new Set(current.map((value) => value.toLowerCase()));
      for (const value of visibleValues) {
        if (!existing.has(value.toLowerCase())) {
          next.push(value);
          existing.add(value.toLowerCase());
        }
      }
      return next;
    });
  }

  function clearInvoicedFilter() {
    setSelectedInvoiced([]);
    setInvoicedSearch("");
  }

  function togglePriority(priority: string) {
    const value = priority.trim();
    if (!value) {
      return;
    }
    const key = value.toLowerCase();
    setSelectedPriorities((current) => {
      const exists = current.some((item) => item.toLowerCase() === key);
      if (exists) {
        return current.filter((item) => item.toLowerCase() !== key);
      }
      return [...current, value];
    });
  }

  function toggleSelectAllPrioritiesVisible() {
    const visibleValues = priorityMatches
      .map((priority) => priority.trim())
      .filter(Boolean);
    if (visibleValues.length === 0) {
      return;
    }
    if (allVisiblePrioritiesSelected) {
      const visibleKeys = new Set(
        visibleValues.map((value) => value.toLowerCase()),
      );
      setSelectedPriorities((current) =>
        current.filter((value) => !visibleKeys.has(value.toLowerCase())),
      );
      return;
    }
    setSelectedPriorities((current) => {
      const next = [...current];
      const existing = new Set(current.map((value) => value.toLowerCase()));
      for (const value of visibleValues) {
        if (!existing.has(value.toLowerCase())) {
          next.push(value);
          existing.add(value.toLowerCase());
        }
      }
      return next;
    });
  }

  function clearPriorityFilter() {
    setSelectedPriorities([]);
    setPrioritySearch("");
  }

  function closeOtherFilters(
    except:
      | "customer"
      | "engineer"
      | "pm"
      | "status"
      | "invoiced"
      | "priority",
  ) {
    if (except !== "customer") {
      setCustomerDropdownOpen(false);
    }
    if (except !== "engineer") {
      setEngineerDropdownOpen(false);
    }
    if (except !== "pm") {
      setPmDropdownOpen(false);
    }
    if (except !== "status") {
      setStatusDropdownOpen(false);
    }
    if (except !== "invoiced") {
      setInvoicedDropdownOpen(false);
    }
    if (except !== "priority") {
      setPriorityDropdownOpen(false);
    }
    setExportDropdownOpen(false);
  }

  function handleExport(format: "excel" | "pdf" | "csv") {
    setExportError(null);
    try {
      const exportRows = buildProjectExportRows(
        filteredRows,
        engineerFromNaming,
        pmNameFromNaming,
      );
      if (format === "excel") {
        exportProjectsAsExcel(exportRows);
      } else if (format === "pdf") {
        exportProjectsAsPdf(exportRows);
      } else {
        exportProjectsAsCsv(exportRows);
      }
      setExportDropdownOpen(false);
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Failed to export projects.",
      );
    }
  }

  useEffect(() => {
    if (!multilineEditor) {
      return;
    }
    const timer = window.setTimeout(() => {
      editorTextareaRef.current?.focus();
      const el = editorTextareaRef.current;
      if (el) {
        const length = el.value.length;
        el.setSelectionRange(length, length);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [multilineEditor?.rowId, multilineEditor?.field]);

  useEffect(() => {
    if (!pmCommentsPrompt) {
      return;
    }
    const timer = window.setTimeout(() => {
      pmCommentsTextareaRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [pmCommentsPrompt?.rowId]);

  useEffect(() => {
    if (!statusPmPrompt) {
      return;
    }
    const timer = window.setTimeout(() => {
      statusPmTextareaRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [statusPmPrompt?.rowId, statusPmPrompt?.nextStatus]);

  function openStatusPmActionPrompt(row: ProjectDetailEntry, nextStatus: string) {
    const reminder = reminderFieldsForStatus(nextStatus);
    const showFollowUpDays = isPreliminaryReportSentStatus(nextStatus);
    const followUpDays = "14";
    const pmActionItems =
      reminder?.pmActionItems ?? row.pmActionItems.trim() ?? "";
    const pmActionItemsDate = showFollowUpDays
      ? addDaysIso(14)
      : reminder?.pmActionItemsDate ||
        row.pmActionItemsDate.trim().slice(0, 10) ||
        todayIsoInLosAngeles();

    setStatusPmPrompt({
      rowId: row.id,
      projectLabel: row.displayId || row.projectName || "Project",
      previousStatus: row.status,
      nextStatus,
      pmActionItems,
      pmActionItemsDate,
      followUpDays,
      showFollowUpDays,
    });
  }

  async function handleFieldChange(
    rowId: string,
    field: EditableField,
    value: string,
    extras?: {
      pmActionItems?: string;
      pmActionItemsDate?: string;
    },
  ) {
    const previous = persistedRowsRef.current;
    const previousRow =
      previous.find((row) => row.id === rowId) ??
      rows.find((row) => row.id === rowId);

    let patch: Partial<ProjectDetailEntry> & { id: string } = {
      id: rowId,
      [field]: value,
    };

    const toSave = rows.map((row) => {
      if (row.id !== rowId) {
        return row;
      }

      const nextRow = { ...row, [field]: value };

      if (field === "status") {
        const nextStatus = value.trim();
        const previousStatus = (previousRow?.status ?? "").trim();
        if (nextStatus && nextStatus !== previousStatus) {
          nextRow.revisionHistory = appendStatusRevision(
            previousRow?.revisionHistory ?? row.revisionHistory,
            nextStatus,
          );
          patch = {
            ...patch,
            revisionHistory: nextRow.revisionHistory,
          };
          if (isFinalReportSentStatus(nextStatus)) {
            nextRow.finalSccsSent = todayIsoInLosAngeles();
            patch = { ...patch, finalSccsSent: nextRow.finalSccsSent };
          }

          const pmActionItems =
            extras?.pmActionItems !== undefined
              ? extras.pmActionItems
              : reminderFieldsForStatus(nextStatus)?.pmActionItems;
          const pmActionItemsDate =
            extras?.pmActionItemsDate !== undefined
              ? extras.pmActionItemsDate
              : reminderFieldsForStatus(nextStatus)?.pmActionItemsDate;

          if (pmActionItems !== undefined) {
            nextRow.pmActionItems = pmActionItems;
            patch = { ...patch, pmActionItems: nextRow.pmActionItems };
          }
          if (pmActionItemsDate !== undefined) {
            nextRow.pmActionItemsDate = pmActionItemsDate;
            patch = {
              ...patch,
              pmActionItemsDate: nextRow.pmActionItemsDate,
            };
          }
        }
      }

      if (field === "invoiced") {
        const nextInvoiced = value.trim().toUpperCase().replace(/\s+/g, " ");
        nextRow.invoiced = isReadyToInvoice(nextInvoiced)
          ? READY_TO_INVOICE_VALUE
          : nextInvoiced;
        patch = { ...patch, invoiced: nextRow.invoiced };
        const previousInvoiced = (
          previousRow?.invoiced ?? row.invoiced
        )
          .trim()
          .toUpperCase()
          .replace(/\s+/g, " ");
        const wasReady = isReadyToInvoice(previousInvoiced);
        if (
          isReadyToInvoice(nextRow.invoiced) &&
          !wasReady &&
          !(previousRow?.readyToInvoiceDate ?? row.readyToInvoiceDate).trim()
        ) {
          nextRow.readyToInvoiceDate = todayIsoInLosAngeles();
          patch = {
            ...patch,
            readyToInvoiceDate: nextRow.readyToInvoiceDate,
          };
        }
        if (
          nextRow.invoiced === "FULL" &&
          previousInvoiced !== "FULL"
        ) {
          nextRow.fullInvoicedDate = todayMmDdYyyyInLosAngeles();
          patch = {
            ...patch,
            fullInvoicedDate: nextRow.fullInvoicedDate,
          };
        }
      }

      return nextRow;
    });

    setRows(toSave);
    setSavingKey(savingKeyFor(rowId, field));
    setError(null);

    try {
      // Only patch changed fields onto the server row (avoids undoing Done).
      const response = await fetch("/api/project-details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectDetail: patch }),
      });
      const data = (await response.json()) as {
        error?: string;
        projectDetail?: ProjectDetailEntry;
      };
      if (!response.ok) {
        throw new Error(data.error || `Failed to save ${field}.`);
      }
      const saved = data.projectDetail;
      const merged = saved
        ? toSave.map((row) => (row.id === rowId ? saved : row))
        : toSave;
      persistedRowsRef.current = merged;
      setRows(merged);
      return true;
    } catch (saveError) {
      setRows(previous);
      setError(
        saveError instanceof Error
          ? saveError.message
          : `Failed to save ${field}.`,
      );
      return false;
    } finally {
      setSavingKey(null);
    }
  }

  async function saveStatusPmActionPrompt() {
    if (!statusPmPrompt) {
      return;
    }
    const ok = await handleFieldChange(
      statusPmPrompt.rowId,
      "status",
      statusPmPrompt.nextStatus,
      {
        pmActionItems: statusPmPrompt.pmActionItems,
        pmActionItemsDate: statusPmPrompt.pmActionItemsDate.slice(0, 10),
      },
    );
    if (ok) {
      setStatusPmPrompt(null);
    }
  }

  async function handleInvoicedChange(row: ProjectDetailEntry, value: string) {
    if (isFullyInvoiced(row)) {
      setError(
        "This project is fully invoiced (100%). Invoiced status is locked as FULL.",
      );
      // Heal stale READY/PARTIAL rows that already hit 100%.
      if (row.invoiced.trim().toUpperCase() !== "FULL") {
        await handleFieldChange(row.id, "invoiced", "FULL");
      }
      return;
    }
    if (
      isReadyToInvoice(value) &&
      remainingInvoicePercent({ ...row, invoiced: "PARTIAL" }) <= 0
    ) {
      setError(
        "This project is already invoiced to 100%. It is locked as FULL.",
      );
      await handleFieldChange(row.id, "invoiced", "FULL");
      return;
    }
    const becomingReady =
      isReadyToInvoice(value) && !isReadyToInvoice(row.invoiced);
    const ok = await handleFieldChange(row.id, "invoiced", value);
    if (!ok || !becomingReady) {
      return;
    }
    const latest =
      persistedRowsRef.current.find((item) => item.id === row.id) ?? row;
    setPmCommentsPrompt({
      rowId: row.id,
      projectLabel: row.displayId || row.projectName || "Project",
      draft: latest.pmComments,
    });
  }

  async function savePmCommentsPrompt() {
    if (!pmCommentsPrompt) {
      return;
    }
    const ok = await handleFieldChange(
      pmCommentsPrompt.rowId,
      "pmComments",
      pmCommentsPrompt.draft,
    );
    if (ok) {
      setPmCommentsPrompt(null);
    }
  }

  function openMultilineEditor(
    row: ProjectDetailEntry,
    field: MultilineField,
    label: string,
  ) {
    setMultilineEditor({
      rowId: row.id,
      field,
      label,
      projectLabel: row.displayId || row.projectName || "Project",
      draft: row[field],
    });
  }

  async function saveMultilineEditor() {
    if (!multilineEditor) {
      return;
    }
    const ok = await handleFieldChange(
      multilineEditor.rowId,
      multilineEditor.field,
      multilineEditor.draft,
    );
    if (ok) {
      setMultilineEditor(null);
    }
  }

  function requestCompleteProject(row: ProjectDetailEntry) {
    setCompleteConfirm({
      rowId: row.id,
      projectLabel: row.displayId || row.projectName || "Project",
    });
  }

  function cancelCompleteProject() {
    setCompleteConfirm(null);
  }

  async function confirmCompleteProject() {
    if (!completeConfirm) {
      return;
    }
    const rowId = completeConfirm.rowId;
    const previous = persistedRowsRef.current;
    setCompletingId(rowId);
    setError(null);

    try {
      const response = await fetch("/api/completed-projects", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId: rowId }),
      });
      const data = (await response.json()) as {
        error?: string;
        projectDetails?: ProjectDetailEntry[];
      };
      if (!response.ok) {
        throw new Error(data.error || "Failed to complete project.");
      }
      const next = data.projectDetails ?? [];
      persistedRowsRef.current = next;
      setRows(next);
      setCompleteConfirm(null);
    } catch (completeError) {
      setRows(previous);
      setError(
        completeError instanceof Error
          ? completeError.message
          : "Failed to complete project.",
      );
      setCompleteConfirm(null);
    } finally {
      setCompletingId(null);
    }
  }

  function renderMultilinePreview(
    row: ProjectDetailEntry,
    field: MultilineField,
    label: string,
  ) {
    const value = previewText(row[field]);
    const isSaving = savingKey === savingKeyFor(row.id, field);

    return (
      <button
        type="button"
        className="table-preview"
        disabled={isSaving}
        aria-label={`${label} for ${row.projectName || row.displayId}. Click to edit or full preview.`}
        onClick={() => openMultilineEditor(row, field, label)}
      >
        {value ? (
          <span className="table-preview-text">{value}</span>
        ) : (
          <span className="table-preview-empty">No text yet</span>
        )}
        <span className="table-preview-action">Edit / Full Preview</span>
      </button>
    );
  }

  function formatDateLabel(value: string) {
    if (!value.trim()) {
      return "Select date";
    }
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) {
      return value;
    }
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    const year = String(date.getFullYear()).slice(-2);
    return `${month}/${day}/${year}`;
  }

  function openNativeDatePicker(input: HTMLInputElement | null) {
    if (!input || input.disabled) {
      return;
    }
    input.focus();
    const picker = (
      input as HTMLInputElement & { showPicker?: () => void }
    ).showPicker;
    if (typeof picker === "function") {
      try {
        picker.call(input);
      } catch {
        // Browser may block showPicker without a direct gesture fallback.
      }
    }
  }

  function renderDateInput(
    row: ProjectDetailEntry,
    field: EditableField,
    label: string,
  ) {
    const value = String(row[field] ?? "");
    const disabled = savingKey === savingKeyFor(row.id, field);
    const inputId = `proj-dt-${field}-${row.id}`;

    return (
      <div className="table-date-field">
        <button
          type="button"
          className="table-date-button"
          disabled={disabled}
          aria-label={`${label} for ${row.projectName || row.displayId}`}
          onClick={() => {
            const input = document.getElementById(
              inputId,
            ) as HTMLInputElement | null;
            openNativeDatePicker(input);
          }}
        >
          <span className="table-date-button-text">{formatDateLabel(value)}</span>
          <span className="table-date-button-icon" aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="3"
                y="5"
                width="18"
                height="16"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.75"
              />
              <path
                d="M3 10H21"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <path
                d="M8 3V7"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <path
                d="M16 3V7"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </button>
        <input
          id={inputId}
          className="table-date-native-hidden"
          type="date"
          tabIndex={-1}
          name={inputId}
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          data-1p-ignore="true"
          data-lpignore="true"
          data-bwignore="true"
          data-form-type="other"
          value={value}
          disabled={disabled}
          aria-hidden="true"
          onChange={(event) =>
            void handleFieldChange(row.id, field, event.target.value)
          }
        />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(filteredRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filteredRows.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <section className="content-panel content-panel--actions">
      <div className="projects-filters-bar">
        <div className="projects-filters-left">
          <span className="projects-filters-label">Filters</span>
          <div className="filter-chip" ref={customerFilterRef}>
          <button
            type="button"
            className={
              selectedCustomerIds.length > 0
                ? "filter-chip-button filter-chip-button--active"
                : "filter-chip-button"
            }
            disabled={!ready}
            aria-expanded={customerDropdownOpen}
            aria-controls={customerListId}
            onClick={() => {
              setCustomerDropdownOpen((open) => !open);
              closeOtherFilters("customer");
            }}
          >
            Customer
            {selectedCustomerIds.length > 0
              ? ` (${selectedCustomerIds.length})`
              : ""}
          </button>
          {customerDropdownOpen ? (
            <div
              id={customerListId}
              className="filter-dropdown"
              role="dialog"
              aria-label="Filter by customer"
            >
              <input
                ref={customerSearchRef}
                className="field-input filter-dropdown-search"
                type="search"
                value={customerSearch}
                placeholder="Search for a Customer..."
                onChange={(event) => setCustomerSearch(event.target.value)}
                autoComplete="off"
              />
              <div className="filter-dropdown-list">
                <label className="filter-dropdown-option filter-dropdown-option--select-all">
                  <input
                    type="checkbox"
                    checked={allVisibleCustomersSelected}
                    disabled={customerMatches.length === 0}
                    onChange={toggleSelectAllCustomersVisible}
                  />
                  <span>Select all</span>
                </label>
                {customerMatches.length === 0 ? (
                  <p className="filter-dropdown-empty">No matching customers.</p>
                ) : (
                  customerMatches.map((customer) => {
                    const id = customer.customerId.trim();
                    const checked = selectedCustomerIdSet.has(id.toLowerCase());
                    const name = customer.customerName.trim();
                    return (
                      <label key={customer.id} className="filter-dropdown-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleCustomerId(id)}
                        />
                        <span className="filter-dropdown-option-text">
                          <span className="filter-dropdown-option-title">
                            {name || id}
                          </span>
                          {name ? (
                            <span className="filter-dropdown-option-meta">
                              {id}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {selectedCustomerIds.length > 0 ? (
                <button
                  type="button"
                  className="filter-dropdown-clear"
                  onClick={clearCustomerFilter}
                >
                  Clear customer filter
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="filter-chip" ref={engineerFilterRef}>
          <button
            type="button"
            className={
              selectedEngineerNames.length > 0
                ? "filter-chip-button filter-chip-button--active"
                : "filter-chip-button"
            }
            disabled={!ready}
            aria-expanded={engineerDropdownOpen}
            aria-controls={engineerListId}
            onClick={() => {
              setEngineerDropdownOpen((open) => !open);
              closeOtherFilters("engineer");
            }}
          >
            Engineer
            {selectedEngineerNames.length > 0
              ? ` (${selectedEngineerNames.length})`
              : ""}
          </button>
          {engineerDropdownOpen ? (
            <div
              id={engineerListId}
              className="filter-dropdown"
              role="dialog"
              aria-label="Filter by engineer"
            >
              <input
                ref={engineerSearchRef}
                className="field-input filter-dropdown-search"
                type="search"
                value={engineerSearch}
                placeholder="Search for an Engineer..."
                onChange={(event) => setEngineerSearch(event.target.value)}
                autoComplete="off"
              />
              <div className="filter-dropdown-list">
                <label className="filter-dropdown-option filter-dropdown-option--select-all">
                  <input
                    type="checkbox"
                    checked={allVisibleEngineersSelected}
                    disabled={engineerMatches.length === 0}
                    onChange={toggleSelectAllEngineersVisible}
                  />
                  <span>Select all</span>
                </label>
                {engineerMatches.length === 0 ? (
                  <p className="filter-dropdown-empty">
                    {atsUsers.length === 0
                      ? "No active ATS users loaded."
                      : "No matching engineers."}
                  </p>
                ) : (
                  engineerMatches.map((user) => {
                    const name = user.name.trim();
                    const checked = selectedEngineerNameSet.has(
                      name.toLowerCase(),
                    );
                    return (
                      <label key={user.id} className="filter-dropdown-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleEngineerName(name)}
                        />
                        <span className="filter-dropdown-option-text">
                          <span className="filter-dropdown-option-title">
                            {name}
                          </span>
                          {user.email.trim() ? (
                            <span className="filter-dropdown-option-meta">
                              {user.email.trim()}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {selectedEngineerNames.length > 0 ? (
                <button
                  type="button"
                  className="filter-dropdown-clear"
                  onClick={clearEngineerFilter}
                >
                  Clear engineer filter
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="filter-chip" ref={pmFilterRef}>
          <button
            type="button"
            className={
              selectedPmNames.length > 0
                ? "filter-chip-button filter-chip-button--active"
                : "filter-chip-button"
            }
            disabled={!ready}
            aria-expanded={pmDropdownOpen}
            aria-controls={pmListId}
            onClick={() => {
              setPmDropdownOpen((open) => !open);
              closeOtherFilters("pm");
            }}
          >
            PM
            {selectedPmNames.length > 0
              ? ` (${selectedPmNames.length})`
              : ""}
          </button>
          {pmDropdownOpen ? (
            <div
              id={pmListId}
              className="filter-dropdown"
              role="dialog"
              aria-label="Filter by PM"
            >
              <input
                ref={pmSearchRef}
                className="field-input filter-dropdown-search"
                type="search"
                value={pmSearch}
                placeholder="Search for a PM..."
                onChange={(event) => setPmSearch(event.target.value)}
                autoComplete="off"
              />
              <div className="filter-dropdown-list">
                <label className="filter-dropdown-option filter-dropdown-option--select-all">
                  <input
                    type="checkbox"
                    checked={allVisiblePmsSelected}
                    disabled={pmMatches.length === 0}
                    onChange={toggleSelectAllPmsVisible}
                  />
                  <span>Select all</span>
                </label>
                {pmMatches.length === 0 ? (
                  <p className="filter-dropdown-empty">
                    {atsUsers.length === 0
                      ? "No active ATS users loaded."
                      : "No matching PMs."}
                  </p>
                ) : (
                  pmMatches.map((user) => {
                    const name = user.name.trim();
                    const checked = selectedPmNameSet.has(name.toLowerCase());
                    return (
                      <label key={`pm-${user.id}`} className="filter-dropdown-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePmName(name)}
                        />
                        <span className="filter-dropdown-option-text">
                          <span className="filter-dropdown-option-title">
                            {name}
                          </span>
                          {user.email.trim() ? (
                            <span className="filter-dropdown-option-meta">
                              {user.email.trim()}
                            </span>
                          ) : null}
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {selectedPmNames.length > 0 ? (
                <button
                  type="button"
                  className="filter-dropdown-clear"
                  onClick={clearPmFilter}
                >
                  Clear PM filter
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="filter-chip" ref={statusFilterRef}>
          <button
            type="button"
            className={
              selectedStatuses.length > 0
                ? "filter-chip-button filter-chip-button--active"
                : "filter-chip-button"
            }
            disabled={!ready}
            aria-expanded={statusDropdownOpen}
            aria-controls={statusListId}
            onClick={() => {
              setStatusDropdownOpen((open) => !open);
              closeOtherFilters("status");
            }}
          >
            Status
            {selectedStatuses.length > 0
              ? ` (${selectedStatuses.length})`
              : ""}
          </button>
          {statusDropdownOpen ? (
            <div
              id={statusListId}
              className="filter-dropdown"
              role="dialog"
              aria-label="Filter by status"
            >
              <input
                ref={statusSearchRef}
                className="field-input filter-dropdown-search"
                type="search"
                value={statusSearch}
                placeholder="Search for a Status..."
                onChange={(event) => setStatusSearch(event.target.value)}
                autoComplete="off"
              />
              <div className="filter-dropdown-list">
                <label className="filter-dropdown-option filter-dropdown-option--select-all">
                  <input
                    type="checkbox"
                    checked={allVisibleStatusesSelected}
                    disabled={statusMatches.length === 0}
                    onChange={toggleSelectAllStatusesVisible}
                  />
                  <span>Select all</span>
                </label>
                {statusMatches.length === 0 ? (
                  <p className="filter-dropdown-empty">No matching statuses.</p>
                ) : (
                  statusMatches.map((status) => {
                    const checked = selectedStatusSet.has(status.toLowerCase());
                    return (
                      <label key={status} className="filter-dropdown-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleStatus(status)}
                        />
                        <span className="filter-dropdown-option-text">
                          <span className="filter-dropdown-option-title">
                            {status}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {selectedStatuses.length > 0 ? (
                <button
                  type="button"
                  className="filter-dropdown-clear"
                  onClick={clearStatusFilter}
                >
                  Clear status filter
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="filter-chip" ref={invoicedFilterRef}>
          <button
            type="button"
            className={
              selectedInvoiced.length > 0
                ? "filter-chip-button filter-chip-button--active"
                : "filter-chip-button"
            }
            disabled={!ready}
            aria-expanded={invoicedDropdownOpen}
            aria-controls={invoicedListId}
            onClick={() => {
              setInvoicedDropdownOpen((open) => !open);
              closeOtherFilters("invoiced");
            }}
          >
            Invoiced
            {selectedInvoiced.length > 0
              ? ` (${selectedInvoiced.length})`
              : ""}
          </button>
          {invoicedDropdownOpen ? (
            <div
              id={invoicedListId}
              className="filter-dropdown"
              role="dialog"
              aria-label="Filter by invoiced"
            >
              <input
                ref={invoicedSearchRef}
                className="field-input filter-dropdown-search"
                type="search"
                value={invoicedSearch}
                placeholder="Search for Invoiced..."
                onChange={(event) => setInvoicedSearch(event.target.value)}
                autoComplete="off"
              />
              <div className="filter-dropdown-list">
                <label className="filter-dropdown-option filter-dropdown-option--select-all">
                  <input
                    type="checkbox"
                    checked={allVisibleInvoicedSelected}
                    disabled={invoicedMatches.length === 0}
                    onChange={toggleSelectAllInvoicedVisible}
                  />
                  <span>Select all</span>
                </label>
                {invoicedMatches.length === 0 ? (
                  <p className="filter-dropdown-empty">No matching values.</p>
                ) : (
                  invoicedMatches.map((invoiced) => {
                    const checked = selectedInvoicedSet.has(
                      invoiced.toLowerCase(),
                    );
                    return (
                      <label key={invoiced} className="filter-dropdown-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleInvoiced(invoiced)}
                        />
                        <span className="filter-dropdown-option-text">
                          <span className="filter-dropdown-option-title">
                            {invoiced}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {selectedInvoiced.length > 0 ? (
                <button
                  type="button"
                  className="filter-dropdown-clear"
                  onClick={clearInvoicedFilter}
                >
                  Clear invoiced filter
                </button>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="filter-chip" ref={priorityFilterRef}>
          <button
            type="button"
            className={
              selectedPriorities.length > 0
                ? "filter-chip-button filter-chip-button--active"
                : "filter-chip-button"
            }
            disabled={!ready}
            aria-expanded={priorityDropdownOpen}
            aria-controls={priorityListId}
            onClick={() => {
              setPriorityDropdownOpen((open) => !open);
              closeOtherFilters("priority");
            }}
          >
            Priority
            {selectedPriorities.length > 0
              ? ` (${selectedPriorities.length})`
              : ""}
          </button>
          {priorityDropdownOpen ? (
            <div
              id={priorityListId}
              className="filter-dropdown"
              role="dialog"
              aria-label="Filter by priority"
            >
              <input
                ref={prioritySearchRef}
                className="field-input filter-dropdown-search"
                type="search"
                value={prioritySearch}
                placeholder="Search for a Priority..."
                onChange={(event) => setPrioritySearch(event.target.value)}
                autoComplete="off"
              />
              <div className="filter-dropdown-list">
                <label className="filter-dropdown-option filter-dropdown-option--select-all">
                  <input
                    type="checkbox"
                    checked={allVisiblePrioritiesSelected}
                    disabled={priorityMatches.length === 0}
                    onChange={toggleSelectAllPrioritiesVisible}
                  />
                  <span>Select all</span>
                </label>
                {priorityMatches.length === 0 ? (
                  <p className="filter-dropdown-empty">No matching priorities.</p>
                ) : (
                  priorityMatches.map((priority) => {
                    const checked = selectedPrioritySet.has(
                      priority.toLowerCase(),
                    );
                    return (
                      <label key={priority} className="filter-dropdown-option">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => togglePriority(priority)}
                        />
                        <span className="filter-dropdown-option-text">
                          <span className="filter-dropdown-option-title">
                            {priority}
                          </span>
                        </span>
                      </label>
                    );
                  })
                )}
              </div>
              {selectedPriorities.length > 0 ? (
                <button
                  type="button"
                  className="filter-dropdown-clear"
                  onClick={clearPriorityFilter}
                >
                  Clear priority filter
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
        </div>

        <div className="projects-filters-right" ref={exportMenuRef}>
          <button
            type="button"
            className="filter-chip-button projects-export-button"
            disabled={!ready}
            aria-expanded={exportDropdownOpen}
            aria-controls={exportMenuId}
            onClick={() => {
              setExportDropdownOpen((open) => !open);
              setCustomerDropdownOpen(false);
              setEngineerDropdownOpen(false);
              setPmDropdownOpen(false);
              setStatusDropdownOpen(false);
              setInvoicedDropdownOpen(false);
              setPriorityDropdownOpen(false);
            }}
          >
            Export
          </button>
          {exportDropdownOpen ? (
            <div
              id={exportMenuId}
              className="filter-dropdown filter-dropdown--export"
              role="menu"
              aria-label="Export projects"
            >
              <button
                type="button"
                className="export-menu-item"
                role="menuitem"
                onClick={() => handleExport("excel")}
              >
                Export as Excel
              </button>
              <button
                type="button"
                className="export-menu-item"
                role="menuitem"
                onClick={() => handleExport("pdf")}
              >
                Export as PDF
              </button>
              <button
                type="button"
                className="export-menu-item"
                role="menuitem"
                onClick={() => handleExport("csv")}
              >
                Export as CSV
              </button>
            </div>
          ) : null}
        </div>
      </div>

      {exportError ? (
        <p className="form-message error" role="alert">
          {exportError}
        </p>
      ) : null}

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading projects…</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="projects-table projects-table--wide">
              <thead>
                <tr>
                  {PROJECT_TABLE_HEADERS.map((header, index) => (
                    <th
                      key={`${header}-${index}`}
                      className={
                        index < 3 ? `col-sticky col-sticky-${index + 1}` : undefined
                      }
                    >
                      {header}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr>
                    <td
                      colSpan={PROJECT_TABLE_HEADERS.length}
                      className="table-empty-cell"
                    >
                      {selectedCustomerIds.length > 0 ||
                      selectedEngineerNames.length > 0 ||
                      selectedPmNames.length > 0 ||
                      selectedStatuses.length > 0 ||
                      selectedInvoiced.length > 0 ||
                      selectedPriorities.length > 0
                        ? "No projects match the selected filters."
                        : "No projects yet. Create one from Project Naming."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={row.id}>
                      <td className="col-sticky col-sticky-1">
                        {cell(row.displayId)}
                      </td>
                      <td className="col-sticky col-sticky-2">
                        {cell(row.customer)}
                      </td>
                      <td className="col-sticky col-sticky-3">
                        {cell(row.projectName)}
                      </td>
                      <td>
                        {row.projectInitializeDate.trim()
                          ? formatDateLabel(row.projectInitializeDate)
                          : "—"}
                      </td>
                      <td>{cell(engineerFromNaming(row))}</td>
                      <td>{cell(pmNameFromNaming(row))}</td>
                      <td>
                        <select
                          className="field-input field-select table-select table-select--status"
                          value={row.status}
                          disabled={
                            savingKey === savingKeyFor(row.id, "status")
                          }
                          aria-label={`Status for ${row.projectName || row.displayId}`}
                          onChange={(event) => {
                            const nextStatus = event.target.value;
                            if (nextStatus === row.status) {
                              return;
                            }
                            if (!nextStatus.trim()) {
                              void handleFieldChange(row.id, "status", "");
                              return;
                            }
                            openStatusPmActionPrompt(row, nextStatus);
                          }}
                        >
                          <option value="">Select status</option>
                          {statusOptions.map((status) => (
                            <option key={status} value={status}>
                              {status}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <select
                          className="field-input field-select table-select"
                          value={
                            isFullyInvoiced(row) ? "FULL" : row.invoiced
                          }
                          disabled={
                            isFullyInvoiced(row) ||
                            savingKey === savingKeyFor(row.id, "invoiced")
                          }
                          title={
                            isFullyInvoiced(row)
                              ? "Fully invoiced (100%) — locked"
                              : undefined
                          }
                          aria-label={`Invoiced for ${row.projectName || row.displayId}`}
                          onChange={(event) =>
                            void handleInvoicedChange(row, event.target.value)
                          }
                        >
                          <option value="">Select invoiced</option>
                          {invoicedOptions.map((invoiced) => (
                            <option key={invoiced} value={invoiced}>
                              {invoiced}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        {renderMultilinePreview(
                          row,
                          "recentActivity",
                          "Recent activity",
                        )}
                      </td>
                      <td>
                        {renderDateInput(
                          row,
                          "recentActivityDate",
                          "Recent activity date",
                        )}
                      </td>
                      <td>
                        {renderMultilinePreview(
                          row,
                          "pmActionItems",
                          "Pm action items",
                        )}
                      </td>
                      <td>
                        {renderDateInput(
                          row,
                          "pmActionItemsDate",
                          "Pm action items date",
                        )}
                      </td>
                      <td>
                        {renderMultilinePreview(
                          row,
                          "lastEmailReceivedClient",
                          "Last email received",
                        )}
                      </td>
                      <td>
                        {renderDateInput(
                          row,
                          "lastEmailReceivedDate",
                          "Client mail date",
                        )}
                      </td>
                      <td className="table-complete-cell">
                        <input
                          type="checkbox"
                          className="table-complete-checkbox"
                          checked={
                            completeConfirm?.rowId === row.id ||
                            completingId === row.id
                          }
                          disabled={completingId === row.id}
                          aria-label={`Project completed for ${row.projectName || row.displayId}`}
                          onChange={(event) => {
                            if (event.target.checked) {
                              requestCompleteProject(row);
                            }
                          }}
                        />
                      </td>
                      <td>
                        <select
                          className="field-input field-select table-select"
                          value={row.priority}
                          disabled={
                            savingKey === savingKeyFor(row.id, "priority")
                          }
                          aria-label={`Priority for ${row.projectName || row.displayId}`}
                          onChange={(event) =>
                            void handleFieldChange(
                              row.id,
                              "priority",
                              event.target.value,
                            )
                          }
                        >
                          <option value="">Select priority</option>
                          {priorityOptions.map((priority) => (
                            <option key={priority} value={priority}>
                              {priority}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="field-input table-number-input"
                          type="number"
                          min={0}
                          step={1}
                          inputMode="numeric"
                          value={row.etaDays}
                          disabled={
                            savingKey === savingKeyFor(row.id, "etaDays")
                          }
                          aria-label={`ETA days for ${row.projectName || row.displayId}`}
                          placeholder="Days"
                          onChange={(event) =>
                            void handleFieldChange(
                              row.id,
                              "etaDays",
                              event.target.value,
                            )
                          }
                        />
                      </td>
                      <td>
                        {renderMultilinePreview(
                          row,
                          "revisionHistory",
                          "Revision History",
                        )}
                      </td>
                      <td>
                        {renderMultilinePreview(
                          row,
                          "partialInvoiceHistory",
                          "Partial Invoicing Date",
                        )}
                      </td>
                      <td>
                        {renderMultilinePreview(
                          row,
                          "fullInvoicedDate",
                          "Full Invoiced Date",
                        )}
                      </td>
                      <td>
                        {renderMultilinePreview(
                          row,
                          "pmComments",
                          "PM Comments",
                        )}
                      </td>
                      <td>
                        {renderDateInput(
                          row,
                          "finalSccsSent",
                          "Final SCCS Sent",
                        )}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filteredRows.length > PAGE_SIZE ? (
            <div className="pagination-bar">
              <button
                type="button"
                className="button secondary"
                disabled={currentPage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </button>
              <span className="pagination-status">
                Page {currentPage} of {totalPages}
                <span className="pagination-range">
                  {" "}
                  ({pageStart + 1}–
                  {Math.min(pageStart + PAGE_SIZE, filteredRows.length)} of{" "}
                  {filteredRows.length})
                </span>
              </span>
              <button
                type="button"
                className="button secondary"
                disabled={currentPage >= totalPages}
                onClick={() =>
                  setPage((current) => Math.min(totalPages, current + 1))
                }
              >
                Next
              </button>
            </div>
          ) : null}
        </>
      )}

      {mounted && multilineEditor
        ? createPortal(
            <div className="dialog-backdrop" role="presentation">
              <div
                className="dialog-panel dialog-panel--notes"
                role="dialog"
                aria-modal="true"
                aria-labelledby={editorTitleId}
              >
                <div className="dialog-header">
                  <h2 id={editorTitleId} className="dialog-title">
                    {multilineEditor.label}
                  </h2>
                  <button
                    type="button"
                    className="dialog-close"
                    aria-label="Close"
                    onClick={() => setMultilineEditor(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="dialog-subtitle">
                  {multilineEditor.projectLabel}
                </p>
                <textarea
                  ref={editorTextareaRef}
                  className="field-input notes-editor"
                  value={multilineEditor.draft}
                  rows={Math.min(
                    24,
                    Math.max(10, multilineEditor.draft.split("\n").length + 2),
                  )}
                  placeholder={`Write ${multilineEditor.label.toLowerCase()}…`}
                  onChange={(event) =>
                    setMultilineEditor((current) =>
                      current
                        ? { ...current, draft: event.target.value }
                        : current,
                    )
                  }
                />
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setMultilineEditor(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    disabled={
                      savingKey ===
                      savingKeyFor(
                        multilineEditor.rowId,
                        multilineEditor.field,
                      )
                    }
                    onClick={() => void saveMultilineEditor()}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && completeConfirm
        ? createPortal(
            <div className="dialog-backdrop" role="presentation">
              <div
                className="dialog-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={completeTitleId}
              >
                <div className="dialog-header">
                  <h2 id={completeTitleId} className="dialog-title">
                    Confirmation
                  </h2>
                  <button
                    type="button"
                    className="dialog-close"
                    aria-label="Close"
                    onClick={cancelCompleteProject}
                  >
                    ×
                  </button>
                </div>
                <p className="dialog-subtitle">
                  {completeConfirm.projectLabel}
                </p>
                <p className="form-message">
                  Project is completed. Is this correct?
                </p>
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={completingId === completeConfirm.rowId}
                    onClick={cancelCompleteProject}
                  >
                    No
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    disabled={completingId === completeConfirm.rowId}
                    onClick={() => void confirmCompleteProject()}
                  >
                    {completingId === completeConfirm.rowId
                      ? "Completing…"
                      : "Yes"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && pmCommentsPrompt
        ? createPortal(
            <div className="dialog-backdrop" role="presentation">
              <div
                className="dialog-panel dialog-panel--notes"
                role="dialog"
                aria-modal="true"
                aria-labelledby={pmCommentsTitleId}
              >
                <div className="dialog-header">
                  <h2 id={pmCommentsTitleId} className="dialog-title">
                    PM comments for invoicing
                  </h2>
                  <button
                    type="button"
                    className="dialog-close"
                    aria-label="Close"
                    onClick={() => setPmCommentsPrompt(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="dialog-subtitle">
                  Enter PM comments for project {pmCommentsPrompt.projectLabel}
                </p>
                <textarea
                  ref={pmCommentsTextareaRef}
                  className="field-input notes-editor"
                  value={pmCommentsPrompt.draft}
                  rows={8}
                  placeholder="Write PM comments for invoicing…"
                  onChange={(event) =>
                    setPmCommentsPrompt((current) =>
                      current
                        ? { ...current, draft: event.target.value }
                        : current,
                    )
                  }
                />
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setPmCommentsPrompt(null)}
                  >
                    Skip
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    disabled={
                      savingKey ===
                      savingKeyFor(pmCommentsPrompt.rowId, "pmComments")
                    }
                    onClick={() => void savePmCommentsPrompt()}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && statusPmPrompt
        ? createPortal(
            <div className="dialog-backdrop" role="presentation">
              <div
                className="dialog-panel dialog-panel--notes"
                role="dialog"
                aria-modal="true"
                aria-labelledby={statusPmTitleId}
              >
                <div className="dialog-header">
                  <h2 id={statusPmTitleId} className="dialog-title">
                    PM Action Items
                  </h2>
                  <button
                    type="button"
                    className="dialog-close"
                    aria-label="Close"
                    onClick={() => setStatusPmPrompt(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="dialog-subtitle">
                  {statusPmPrompt.projectLabel}
                </p>
                <p className="form-message">
                  Status will change to{" "}
                  <strong>{statusPmPrompt.nextStatus}</strong>. Enter PM Action
                  Items, then Save to apply.
                </p>
                <label className="field">
                  <span className="field-label">PM Action Items</span>
                  <textarea
                    ref={statusPmTextareaRef}
                    className="field-input notes-editor"
                    value={statusPmPrompt.pmActionItems}
                    rows={6}
                    placeholder="PM Action Items…"
                    onChange={(event) =>
                      setStatusPmPrompt((current) =>
                        current
                          ? {
                              ...current,
                              pmActionItems: event.target.value,
                            }
                          : current,
                      )
                    }
                  />
                </label>
                {statusPmPrompt.showFollowUpDays ? (
                  <label className="field">
                    <span className="field-label">Follow-up days</span>
                    <input
                      className="field-input"
                      type="number"
                      min={0}
                      step={1}
                      value={statusPmPrompt.followUpDays}
                      onChange={(event) => {
                        const followUpDays = event.target.value;
                        const parsed = Number.parseInt(followUpDays, 10);
                        const days = Number.isFinite(parsed)
                          ? Math.max(0, parsed)
                          : 14;
                        setStatusPmPrompt((current) =>
                          current
                            ? {
                                ...current,
                                followUpDays,
                                pmActionItemsDate: addDaysIso(days),
                              }
                            : current,
                        );
                      }}
                    />
                    <span className="field-hint">
                      Sets PM Action Items Date to today + days (default 14 for
                      Preliminary Report Sent).
                    </span>
                  </label>
                ) : null}
                <label className="field">
                  <span className="field-label">PM Action Items Date</span>
                  <input
                    className="field-input field-date"
                    type="date"
                    value={statusPmPrompt.pmActionItemsDate.slice(0, 10)}
                    onChange={(event) =>
                      setStatusPmPrompt((current) =>
                        current
                          ? {
                              ...current,
                              pmActionItemsDate: event.target.value,
                            }
                          : current,
                      )
                    }
                  />
                </label>
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setStatusPmPrompt(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    disabled={
                      savingKey ===
                      savingKeyFor(statusPmPrompt.rowId, "status")
                    }
                    onClick={() => void saveStatusPmActionPrompt()}
                  >
                    {savingKey ===
                    savingKeyFor(statusPmPrompt.rowId, "status")
                      ? "Saving…"
                      : "Save"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
