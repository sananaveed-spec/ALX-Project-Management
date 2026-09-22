"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  isFinalReportSentStatus,
  isReadyToInvoice,
  READY_TO_INVOICE_VALUE,
  reminderFieldsForStatus,
  sortProjectDetailsByStatusDesc,
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

export function ProjectsPanel() {
  const [rows, setRows] = useState<ProjectDetailEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  /** UniqueID → engineer from Project Naming (source of truth for display). */
  const [namingEngineerByUniqueId, setNamingEngineerByUniqueId] = useState<
    Record<string, string>
  >({});
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [multilineEditor, setMultilineEditor] =
    useState<MultilineEditorState | null>(null);
  const [completeConfirm, setCompleteConfirm] =
    useState<CompleteConfirmState | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const [sortingByStatus, setSortingByStatus] = useState(false);
  const [pmCommentsPrompt, setPmCommentsPrompt] =
    useState<PmCommentsPromptState | null>(null);
  const [statusPmPrompt, setStatusPmPrompt] =
    useState<StatusPmActionPromptState | null>(null);
  const [mounted, setMounted] = useState(false);
  const persistedRowsRef = useRef<ProjectDetailEntry[]>([]);
  const editorTitleId = useId();
  const completeTitleId = useId();
  const pmCommentsTitleId = useId();
  const statusPmTitleId = useId();
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
          }>;
        };
        if (!cancelled) {
          const byUniqueId: Record<string, string> = {};
          for (const project of data.projects ?? []) {
            const uniqueId = project.uniqueId?.trim() ?? "";
            const engineer = project.engineer?.trim() ?? "";
            if (uniqueId && engineer) {
              byUniqueId[uniqueId.toLowerCase()] = engineer;
            }
          }
          setNamingEngineerByUniqueId(byUniqueId);
        }
      } catch {
        if (!cancelled) {
          setNamingEngineerByUniqueId({});
        }
      }
    }

    void loadNamingEngineers();
    return () => {
      cancelled = true;
    };
  }, []);

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

  async function sortByStatusDescending() {
    const previous = persistedRowsRef.current;
    const sorted = sortProjectDetailsByStatusDesc(previous);
    setSortingByStatus(true);
    setRows(sorted);
    setPage(1);
    setError(null);

    try {
      const response = await fetch("/api/project-details", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectDetails: sorted }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to sort projects.");
      }
      persistedRowsRef.current = sorted;
    } catch (sortError) {
      setRows(previous);
      setError(
        sortError instanceof Error
          ? sortError.message
          : "Failed to sort projects.",
      );
    } finally {
      setSortingByStatus(false);
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

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE);

  function engineerFromNaming(row: ProjectDetailEntry) {
    const fromNaming =
      namingEngineerByUniqueId[row.displayId.trim().toLowerCase()];
    if (fromNaming?.trim()) {
      return fromNaming.trim();
    }
    return row.engineer.trim();
  }

  const statusOptions = (() => {
    const options = new Set<string>(PROJECT_STATUS_OPTIONS);
    for (const row of rows) {
      if (row.status.trim()) {
        options.add(row.status.trim());
      }
    }
    return [...options];
  })();

  const invoicedOptions = (() => {
    const options = new Set<string>(PROJECT_INVOICED_OPTIONS);
    for (const row of rows) {
      if (row.invoiced.trim()) {
        options.add(row.invoiced.trim());
      }
    }
    return [...options];
  })();

  const priorityOptions = (() => {
    const options = new Set<string>(PROJECT_PRIORITY_OPTIONS);
    for (const row of rows) {
      if (row.priority.trim()) {
        options.add(row.priority.trim());
      }
    }
    return [...options];
  })();

  return (
    <section className="content-panel content-panel--actions">
      <div className="panel-title-row panel-title-row--actions-only">
        <button
          type="button"
          className="button secondary"
          disabled={!ready || sortingByStatus || rows.length === 0}
          onClick={() => void sortByStatusDescending()}
        >
          {sortingByStatus ? "Sorting…" : "Sort by Status"}
        </button>
      </div>

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
                      No projects yet. Create one from Project Naming.
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
                          value={row.invoiced}
                          disabled={
                            savingKey === savingKeyFor(row.id, "invoiced")
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

          {rows.length > PAGE_SIZE ? (
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
                  {Math.min(pageStart + PAGE_SIZE, rows.length)} of {rows.length}
                  )
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
