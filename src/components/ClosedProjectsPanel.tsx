"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  sortClosedProjectsNewestFirst,
  type ClosedProjectEntry,
} from "@/lib/closed-projects";
import {
  exportTableAsCsv,
  exportTableAsExcel,
  exportTableAsPdf,
} from "@/lib/list-export";
import {
  LIST_SORT_OPTIONS,
  sortByListSort,
  type ListSort,
} from "@/lib/list-sort";
import { useFitPageSize } from "@/lib/use-fit-page-size";

const TABLE_HEADERS = [
  "ID",
  "Customer",
  "Project Name",
  "Engineer",
  "Status",
  "Invoiced",
  "Closed On",
  "Project Completed",
] as const;

const EXPORT_HEADERS = [
  "ID",
  "Customer",
  "Project Name",
  "Engineer",
  "Status",
  "Invoiced",
  "Closed On",
] as const;

function cell(value: string) {
  return value.trim() ? value : "—";
}

function formatDateLabel(value: string) {
  if (!value.trim()) {
    return "—";
  }
  const date = new Date(`${value}T00:00:00`);
  if (Number.isNaN(date.getTime())) {
    return value;
  }
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const year = String(date.getFullYear());
  return `${month}/${day}/${year}`;
}

function matchesClosedQuery(row: ClosedProjectEntry, query: string) {
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
    row.closedAt,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function rowToExportCells(row: ClosedProjectEntry): string[] {
  return [
    row.displayId.trim(),
    row.customer.trim(),
    row.projectName.trim(),
    row.engineer.trim(),
    row.status.trim(),
    row.invoiced.trim(),
    row.closedAt.trim(),
  ];
}

export function ClosedProjectsPanel() {
  const [rows, setRows] = useState<ClosedProjectEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSort>("name");
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);
  const [completeConfirm, setCompleteConfirm] = useState<{
    rowId: string;
    projectLabel: string;
  } | null>(null);
  const [completingId, setCompletingId] = useState<string | null>(null);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const exportMenuId = useId();
  const completeTitleId = useId();
  const pageSize = useFitPageSize(
    tableWrapRef,
    { rowHeight: 42, minRows: 6, maxRows: 50 },
    ready,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      try {
        const response = await fetch("/api/closed-projects", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Could not load closed projects.");
        }
        const data = (await response.json()) as {
          closedProjects?: ClosedProjectEntry[];
        };
        if (!cancelled) {
          setRows(
            sortClosedProjectsNewestFirst(data.closedProjects ?? []),
          );
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load closed projects.",
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

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => matchesClosedQuery(row, query));
    return sortByListSort(filtered, sort, (row) => row.displayId);
  }, [rows, query, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, sort]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = visibleRows.slice(pageStart, pageStart + pageSize);

  const allVisibleSelected =
    pageRows.length > 0 && pageRows.every((row) => selectedIds.includes(row.id));

  function toggleSelect(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSelectAllVisible(list: ClosedProjectEntry[]) {
    const ids = list.map((row) => row.id);
    const allSelected = ids.every((id) => selectedIds.includes(id));
    if (allSelected) {
      setSelectedIds((current) => current.filter((id) => !ids.includes(id)));
      return;
    }
    setSelectedIds((current) => [...new Set([...current, ...ids])]);
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }
    const lead =
      selectedIds.length === 1
        ? "Remove the selected row from Close Projects?"
        : `Remove ${selectedIds.length} selected rows from Close Projects?`;
    if (!window.confirm(lead)) {
      return;
    }
    const next = rows.filter((row) => !selectedIds.includes(row.id));
    try {
      const response = await fetch("/api/closed-projects", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closedProjects: next }),
      });
      if (!response.ok) {
        const data = (await response.json()) as { error?: string };
        throw new Error(data.error || "Failed to delete closed projects.");
      }
      setRows(sortClosedProjectsNewestFirst(next));
      setSelectedIds([]);
      setError(null);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete closed projects.",
      );
    }
  }

  function handleExport(format: "excel" | "pdf" | "csv") {
    setExportError(null);
    setExportDropdownOpen(false);
    const exportRows = visibleRows.map(rowToExportCells);
    const stamp = new Date().toISOString().slice(0, 10);
    try {
      if (format === "excel") {
        exportTableAsExcel(
          [...EXPORT_HEADERS],
          exportRows,
          `Close-Projects-${stamp}.xlsx`,
          "Close Projects",
        );
      } else if (format === "pdf") {
        exportTableAsPdf(
          [...EXPORT_HEADERS],
          exportRows,
          `Close-Projects-${stamp}.pdf`,
          "Close Projects",
        );
      } else {
        exportTableAsCsv(
          [...EXPORT_HEADERS],
          exportRows,
          `Close-Projects-${stamp}.csv`,
        );
      }
    } catch (err) {
      setExportError(
        err instanceof Error ? err.message : "Export failed.",
      );
    }
  }

  async function confirmCompleteProject() {
    if (!completeConfirm) {
      return;
    }
    const rowId = completeConfirm.rowId;
    setCompletingId(rowId);
    setError(null);
    try {
      const response = await fetch("/api/closed-projects/complete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ closedProjectId: rowId }),
      });
      const data = (await response.json()) as {
        error?: string;
        closedProjects?: ClosedProjectEntry[];
      };
      if (!response.ok) {
        throw new Error(data.error || "Failed to complete project.");
      }
      setRows(sortClosedProjectsNewestFirst(data.closedProjects ?? []));
      setCompleteConfirm(null);
      setSelectedIds((current) => current.filter((id) => id !== rowId));
    } catch (completeError) {
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

  return (
    <section className="content-panel content-panel--actions">
      {ready ? (
        <div className="action-row naming-action-row">
          <div className="naming-filters-bar">
            <label className="field history-search-field">
              <span className="visually-hidden">Search</span>
              <input
                className="field-input"
                type="search"
                placeholder="ID, customer, project name, engineer…"
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
              className="button danger"
              disabled={selectedIds.length === 0}
              onClick={() => void handleDeleteSelected()}
            >
              Delete
              {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
            </button>
            <button
              type="button"
              className="action-button"
              disabled={visibleRows.length === 0}
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
                aria-label="Export closed projects"
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
      ) : null}

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
        <p className="table-empty">Loading closed projects…</p>
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
                      aria-label="Select all closed projects on this page"
                    />
                  </th>
                  {TABLE_HEADERS.map((header, index) => (
                    <th
                      key={header}
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
                        ? "No closed projects match this search."
                        : "No closed projects yet. Use Close Project on Active Projects."}
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
                        <td>{cell(row.engineer)}</td>
                        <td>{cell(row.status)}</td>
                        <td>{cell(row.invoiced)}</td>
                        <td>{formatDateLabel(row.closedAt)}</td>
                        <td className="table-complete-cell">
                          <input
                            type="checkbox"
                            className="table-complete-checkbox"
                            checked={
                              completeConfirm?.rowId === row.id ||
                              completingId === row.id
                            }
                            disabled={completingId === row.id}
                            aria-label={`Complete ${row.projectName || row.displayId}`}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setCompleteConfirm({
                                  rowId: row.id,
                                  projectLabel:
                                    row.displayId ||
                                    row.projectName ||
                                    "Project",
                                });
                              }
                            }}
                          />
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {visibleRows.length > pageSize ? (
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
                  {Math.min(pageStart + pageSize, visibleRows.length)} of{" "}
                  {visibleRows.length})
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
                    onClick={() => setCompleteConfirm(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="dialog-subtitle">
                  {completeConfirm.projectLabel}
                </p>
                <p className="form-message">
                  Project is completed. Is this correct? It will move to
                  Completed Projects (invoice history is copied there) and leave
                  Close Projects.
                </p>
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={completingId === completeConfirm.rowId}
                    onClick={() => setCompleteConfirm(null)}
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
    </section>
  );
}
