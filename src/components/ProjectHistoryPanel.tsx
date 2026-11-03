"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  exportTableAsCsv,
  exportTableAsExcel,
  exportTableAsPdf,
  parseSpreadsheetFile,
  SPREADSHEET_IMPORT_ACCEPT,
} from "@/lib/list-export";
import {
  LIST_SORT_OPTIONS,
  sortByListSort,
  type ListSort,
} from "@/lib/list-sort";
import { type ProjectDetailEntry } from "@/lib/project-details";
import {
  normalizeProjectHistory,
  type ProjectHistoryEntry,
} from "@/lib/project-history";
import { useFitPageSize } from "@/lib/use-fit-page-size";

const TABLE_HEADERS = [
  "ID",
  "Customer",
  "Project Name",
  "Date",
  "Engineer",
  "Status",
  "Invoiced",
  "Recent Activity",
  "Date",
  "Action Taken",
  "Date",
  "Comments",
  "Last Email Received (Client)",
  "Date",
] as const;

/** Distinct headers for export/import (table has repeated "Date" labels). */
const EXPORT_HEADERS = [
  "ID",
  "Customer",
  "Project Name",
  "Date",
  "Engineer",
  "Status",
  "Invoiced",
  "Recent Activity",
  "Recent Activity Date",
  "Action Taken",
  "Action Taken Date",
  "Comments",
  "Last Email Received (Client)",
  "Last Email Received Date",
] as const;

function cell(value: string) {
  return value.trim() ? value : "—";
}

function formatDateLabel(value: string) {
  if (!value.trim()) {
    return "—";
  }
  // Accept ISO or already MM/DD/YYYY labels from Excel-style history.
  if (/^\d{1,2}\/\d{1,2}\/\d{2,4}$/.test(value.trim())) {
    return value.trim();
  }
  const date = new Date(`${value.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

function matchesQuery(row: ProjectHistoryEntry, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const haystack = [
    row.displayId,
    row.customer,
    row.projectName,
    row.engineer,
    row.status,
    row.invoiced,
    row.recentActivity,
    row.actionTaken,
    row.comments,
    row.lastEmailReceivedClient,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

type LogWizard = {
  projectId: string;
  comments: string;
};

export function ProjectHistoryPanel() {
  const [rows, setRows] = useState<ProjectHistoryEntry[]>([]);
  const [projects, setProjects] = useState<ProjectDetailEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSort>("name");
  const [page, setPage] = useState(1);
  const [logWizard, setLogWizard] = useState<LogWizard | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const titleId = useId();
  const exportMenuId = useId();
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const pageSize = useFitPageSize(
    tableWrapRef,
    { rowHeight: 44, minRows: 6, maxRows: 50 },
    ready,
  );
  const commentRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const [historyRes, projectsRes] = await Promise.all([
          fetch("/api/project-history", { cache: "no-store" }),
          fetch("/api/project-details", { cache: "no-store" }),
        ]);
        if (!historyRes.ok) {
          throw new Error("Could not load project history.");
        }
        if (!projectsRes.ok) {
          throw new Error("Could not load projects.");
        }
        const historyData = (await historyRes.json()) as {
          history?: ProjectHistoryEntry[];
        };
        const projectsData = (await projectsRes.json()) as {
          projectDetails?: ProjectDetailEntry[];
        };
        if (!cancelled) {
          setRows(historyData.history ?? []);
          setProjects(projectsData.projectDetails ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load project history.",
          );
        }
      } finally {
        if (!cancelled) {
          setReady(true);
        }
      }
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!logWizard) {
      return;
    }
    const timer = window.setTimeout(() => {
      commentRef.current?.focus();
    }, 0);
    return () => window.clearTimeout(timer);
  }, [logWizard]);

  useEffect(() => {
    if (!exportDropdownOpen) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      if (exportMenuRef.current && !exportMenuRef.current.contains(target)) {
        setExportDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [exportDropdownOpen]);

  const filtered = useMemo(() => {
    const matched = rows.filter((row) => matchesQuery(row, query));
    return sortByListSort(matched, sort, (row) => row.displayId);
  }, [rows, query, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = filtered.slice(pageStart, pageStart + pageSize);

  function toggleSelect(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSelectAllVisible(visible: ProjectHistoryEntry[]) {
    const visibleIds = visible.map((row) => row.id);
    const allSelected =
      visibleIds.length > 0 &&
      visibleIds.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !visibleIds.includes(id)),
      );
      return;
    }
    setSelectedIds((current) => [...new Set([...current, ...visibleIds])]);
  }

  const allVisibleSelected =
    pageRows.length > 0 &&
    pageRows.every((row) => selectedIds.includes(row.id));

  async function persistHistory(next: ProjectHistoryEntry[]) {
    const response = await fetch("/api/project-history", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ history: next }),
    });
    const data = (await response.json()) as {
      error?: string;
      history?: ProjectHistoryEntry[];
    };
    if (!response.ok) {
      throw new Error(data.error || "Failed to save project history.");
    }
    return data.history ?? next;
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }
    const lead =
      selectedIds.length === 1
        ? "Delete the selected history row?"
        : `Delete ${selectedIds.length} selected history rows?`;
    if (
      !window.confirm(
        `${lead}\n\nThis only removes rows from Project History. Project Naming, Active Projects, Completed Projects, and Invoicing History are not changed.`,
      )
    ) {
      return;
    }

    const selectedSet = new Set(selectedIds);
    const next = rows.filter((row) => !selectedSet.has(row.id));

    setError(null);
    try {
      setRows(await persistHistory(next));
      setSelectedIds([]);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete projects.",
      );
    }
  }

  function rowToExportCells(row: ProjectHistoryEntry): string[] {
    return [
      row.displayId.trim(),
      row.customer.trim(),
      row.projectName.trim(),
      row.date.trim(),
      row.engineer.trim(),
      row.status.trim(),
      row.invoiced.trim(),
      row.recentActivity.trim(),
      row.recentActivityDate.trim(),
      row.actionTaken.trim(),
      row.actionTakenDate.trim(),
      row.comments.trim(),
      row.lastEmailReceivedClient.trim(),
      row.lastEmailReceivedDate.trim(),
    ];
  }

  function handleExport(format: "excel" | "pdf" | "csv") {
    setExportError(null);
    try {
      const exportRows = filtered.map(rowToExportCells);
      if (format === "excel") {
        exportTableAsExcel(
          [...EXPORT_HEADERS],
          exportRows,
          "project-history",
          "Project History",
        );
      } else if (format === "pdf") {
        exportTableAsPdf("Project History", [...EXPORT_HEADERS], exportRows);
      } else {
        exportTableAsCsv([...EXPORT_HEADERS], exportRows, "project-history");
      }
      setExportDropdownOpen(false);
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : "Failed to export project history.",
      );
    }
  }

  function openImportPicker() {
    setExportDropdownOpen(false);
    importInputRef.current?.click();
  }

  async function handleImportFile(file: File) {
    setImporting(true);
    setExportError(null);
    setError(null);
    try {
      const parsed = await parseSpreadsheetFile(file);
      if (parsed.length < 2) {
        throw new Error(
          "File must include a header row and at least one data row.",
        );
      }

      const headers = parsed[0]!.map((header) => header.trim().toLowerCase());
      const indexOf = (...labels: string[]) =>
        headers.findIndex((header) => labels.includes(header));

      const idIdx = indexOf("id");
      const customerIdx = indexOf("customer");
      const nameIdx = indexOf("project name");
      const dateIdx = indexOf("date");
      const engineerIdx = indexOf("engineer", "zproject engineer");
      const statusIdx = indexOf("status", "zstatus");
      const invoicedIdx = indexOf("invoiced");
      const recentIdx = indexOf("recent activity");
      const recentDateIdx = indexOf("recent activity date", "date");
      // Prefer explicit labels; fall back carefully for Excel duplicate Date cols
      const actionIdx = indexOf("action taken");
      const actionDateIdx = indexOf("action taken date", "date_1");
      const commentsIdx = indexOf("comments");
      const emailIdx = indexOf(
        "last email received (client)",
        "last email received",
      );
      const emailDateIdx = indexOf("last email received date", "date_2");

      // Resolve ambiguous "date" columns by header position when using Excel layout
      const dateColumns = headers
        .map((header, index) => ({ header, index }))
        .filter(({ header }) => header === "date" || header.startsWith("date"));

      const initDateIdx =
        dateIdx >= 0
          ? dateIdx
          : dateColumns[0]?.index ?? -1;
      const resolvedRecentDateIdx =
        headers.indexOf("recent activity date") >= 0
          ? headers.indexOf("recent activity date")
          : dateColumns[1]?.index ?? recentDateIdx;
      const resolvedActionDateIdx =
        actionDateIdx >= 0
          ? actionDateIdx
          : dateColumns[2]?.index ?? -1;
      const resolvedEmailDateIdx =
        emailDateIdx >= 0
          ? emailDateIdx
          : dateColumns[3]?.index ?? -1;

      if (idIdx < 0 && nameIdx < 0 && actionIdx < 0 && commentsIdx < 0) {
        throw new Error(
          "No recognized columns. Export first and use those headers.",
        );
      }

      const next = [...rows];
      let created = 0;

      for (const row of parsed.slice(1)) {
        const displayId = (row[idIdx] ?? "").trim();
        const projectName = (row[nameIdx] ?? "").trim();
        const actionTaken = (row[actionIdx] ?? "").trim();
        const comments = (row[commentsIdx] ?? "").trim();
        if (!displayId && !projectName && !actionTaken && !comments) {
          continue;
        }

        next.push(
          normalizeProjectHistory({
            id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
            displayId,
            customer: (row[customerIdx] ?? "").trim(),
            projectName,
            date: (row[initDateIdx] ?? "").trim(),
            engineer: (row[engineerIdx] ?? "").trim(),
            status: (row[statusIdx] ?? "").trim(),
            invoiced: (row[invoicedIdx] ?? "").trim(),
            recentActivity: (row[recentIdx] ?? "").trim(),
            recentActivityDate: (row[resolvedRecentDateIdx] ?? "").trim(),
            actionTaken,
            actionTakenDate: (row[resolvedActionDateIdx] ?? "").trim(),
            comments,
            lastEmailReceivedClient: (row[emailIdx] ?? "").trim(),
            lastEmailReceivedDate: (row[resolvedEmailDateIdx] ?? "").trim(),
            createdAt: new Date().toISOString(),
          }),
        );
        created += 1;
      }

      if (created === 0) {
        throw new Error("No valid history rows found in the file.");
      }

      setRows(await persistHistory(next));
      window.alert(
        `Imported ${created} history row${created === 1 ? "" : "s"}.`,
      );
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Failed to import project history.",
      );
    } finally {
      setImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
    }
  }

  const sortedProjects = useMemo(
    () =>
      [...projects].sort((a, b) =>
        (a.displayId || a.projectName).localeCompare(
          b.displayId || b.projectName,
          undefined,
          { sensitivity: "base" },
        ),
      ),
    [projects],
  );

  async function submitLogAction() {
    if (!logWizard) {
      return;
    }
    const comments = logWizard.comments.trim();
    if (!logWizard.projectId || !comments) {
      setError("Select a project and enter an action / comment.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/project-history", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectId: logWizard.projectId,
          comments,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        history?: ProjectHistoryEntry[];
        projectDetails?: ProjectDetailEntry[];
      };
      if (!response.ok) {
        throw new Error(data.error || "Failed to log action.");
      }
      setRows(data.history ?? []);
      if (data.projectDetails) {
        setProjects(data.projectDetails);
      }
      setLogWizard(null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to log action.",
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="content-panel content-panel--actions">
      <div className="action-row naming-action-row">
        <div className="naming-filters-bar">
          <label className="field history-search-field">
            <span className="visually-hidden">Search</span>
            <input
              className="field-input"
              type="search"
              placeholder="ID, customer, project name, comments…"
              aria-label="Search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="field customer-sort-field">
            <span className="visually-hidden">Sort</span>
            <select
              className="field-input"
              value={sort}
              aria-label="Sort"
              onChange={(event) => setSort(event.target.value as ListSort)}
            >
              {LIST_SORT_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="naming-action-right" ref={exportMenuRef}>
          <button
            type="button"
            className="button primary"
            disabled={!ready || projects.length === 0}
            onClick={() =>
              setLogWizard({
                projectId: sortedProjects[0]?.id ?? "",
                comments: "",
              })
            }
          >
            Log Action
          </button>
          <button
            type="button"
            className="button danger"
            disabled={!ready || selectedIds.length === 0}
            onClick={() => void handleDeleteSelected()}
          >
            Delete
            {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
          </button>
          <button
            type="button"
            className="action-button"
            disabled={!ready || filtered.length === 0}
            aria-expanded={exportDropdownOpen}
            aria-controls={exportMenuId}
            onClick={() => setExportDropdownOpen((open) => !open)}
          >
            Export
          </button>
          {exportDropdownOpen ? (
            <div
              id={exportMenuId}
              className="filter-dropdown filter-dropdown--export"
              role="menu"
              aria-label="Export project history"
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
          <button
            type="button"
            className="action-button"
            disabled={!ready || importing}
            onClick={openImportPicker}
          >
            {importing ? "Importing…" : "Import"}
          </button>
          <input
            ref={importInputRef}
            type="file"
            accept={SPREADSHEET_IMPORT_ACCEPT}
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                void handleImportFile(file);
              }
            }}
          />
        </div>
      </div>

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {exportError ? (
        <p className="form-message error" role="alert">
          {exportError}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading project history…</p>
      ) : (
        <>
          <div className="table-wrap table-wrap--fit-page" ref={tableWrapRef}>
            <table className="projects-table projects-table--wide projects-table--with-check">
              <thead>
                <tr>
                  <th className="col-sticky col-sticky-check">
                    <input
                      type="checkbox"
                      checked={allVisibleSelected}
                      onChange={() => toggleSelectAllVisible(pageRows)}
                      aria-label="Select all history rows on this page"
                    />
                  </th>
                  {TABLE_HEADERS.map((header, index) => (
                    <th
                      key={`${header}-${index}`}
                      className={
                        index < 3
                          ? `col-sticky col-sticky-${index + 1}`
                          : undefined
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
                      colSpan={TABLE_HEADERS.length + 1}
                      className="table-empty-cell"
                    >
                      {query.trim()
                        ? "No history rows match this search."
                        : "No history yet. Complete a Today To-Do item, use Log Action, or Import."}
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const isSelected = selectedIds.includes(row.id);
                    return (
                    <tr
                      key={row.id}
                      className={isSelected ? "row-selected" : undefined}
                    >
                      <td className="col-sticky col-sticky-check">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSelect(row.id)}
                          aria-label={`Select ${row.projectName || row.displayId}`}
                        />
                      </td>
                      <td className="col-sticky col-sticky-1">
                        {cell(row.displayId)}
                      </td>
                      <td className="col-sticky col-sticky-2">
                        {cell(row.customer)}
                      </td>
                      <td className="col-sticky col-sticky-3">
                        {cell(row.projectName)}
                      </td>
                      <td>{formatDateLabel(row.date)}</td>
                      <td>{cell(row.engineer)}</td>
                      <td>{cell(row.status)}</td>
                      <td>{cell(row.invoiced)}</td>
                      <td>
                        <span className="table-preview-text">
                          {cell(row.recentActivity)}
                        </span>
                      </td>
                      <td>{formatDateLabel(row.recentActivityDate)}</td>
                      <td>
                        <span className="table-preview-text">
                          {cell(row.actionTaken)}
                        </span>
                      </td>
                      <td>{formatDateLabel(row.actionTakenDate)}</td>
                      <td>
                        <span className="table-preview-text">
                          {cell(row.comments)}
                        </span>
                      </td>
                      <td>
                        <span className="table-preview-text">
                          {cell(row.lastEmailReceivedClient)}
                        </span>
                      </td>
                      <td>{formatDateLabel(row.lastEmailReceivedDate)}</td>
                    </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > pageSize ? (
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
                  ({pageStart + 1}–
                  {Math.min(pageStart + pageSize, filtered.length)} of{" "}
                  {filtered.length})
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

      {mounted && logWizard
        ? createPortal(
            <div className="dialog-backdrop" role="presentation">
              <div
                className="dialog-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
              >
                <div className="dialog-header">
                  <h2 id={titleId} className="dialog-title">
                    Enter Action / Comment
                  </h2>
                  <button
                    type="button"
                    className="dialog-close"
                    aria-label="Close"
                    disabled={saving}
                    onClick={() => setLogWizard(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="dialog-subtitle">
                  Excel ManualHistoryupdate — logs to Project History and sets
                  Projects Recent Activity.
                </p>

                <label className="field">
                  <span className="field-label">Project</span>
                  <select
                    className="field-input field-select"
                    value={logWizard.projectId}
                    disabled={saving}
                    onChange={(event) =>
                      setLogWizard({
                        ...logWizard,
                        projectId: event.target.value,
                      })
                    }
                  >
                    {sortedProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.displayId || project.projectName || project.id}
                        {project.projectName
                          ? ` — ${project.projectName}`
                          : ""}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="field">
                  <span className="field-label">
                    Enter what you have done or any comment
                  </span>
                  <textarea
                    ref={commentRef}
                    className="field-input notes-editor"
                    rows={6}
                    value={logWizard.comments}
                    disabled={saving}
                    onChange={(event) =>
                      setLogWizard({
                        ...logWizard,
                        comments: event.target.value,
                      })
                    }
                  />
                </label>

                <div className="dialog-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={saving}
                    onClick={() => setLogWizard(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    disabled={
                      saving ||
                      !logWizard.projectId ||
                      !logWizard.comments.trim()
                    }
                    onClick={() => void submitLogAction()}
                  >
                    {saving ? "Saving…" : "OK"}
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
