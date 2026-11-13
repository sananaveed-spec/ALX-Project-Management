"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
  normalizeCompletedProject,
  sortCompletedProjectsNewestFirst,
  type CompletedProjectEntry,
} from "@/lib/completed-projects";
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
import { useFitPageSize } from "@/lib/use-fit-page-size";

const TABLE_HEADERS = [
  "ID",
  "Customer",
  "Project Name",
  "Date",
  "Project Engineer",
  "PROJECT HISTORY",
  "Partial Invoice Date",
  "Invoiced Date",
  "Final Report Sent on",
  "Project Completed",
  "Labels Shipped",
] as const;

const EXPORT_HEADERS = [...TABLE_HEADERS];

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
  const year = String(date.getFullYear()).slice(-2);
  return `${month}/${day}/${year}`;
}

function matchesCompletedQuery(row: CompletedProjectEntry, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const haystack = [
    row.displayId,
    row.customer,
    row.projectName,
    row.engineer,
    row.projectHistory,
    row.partialInvoiceDate,
    row.invoicedDate,
    row.finalReportSentOn,
    row.projectCompleted,
    row.labelsShipped,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function rowToExportCells(row: CompletedProjectEntry): string[] {
  return [
    row.displayId.trim(),
    row.customer.trim(),
    row.projectName.trim(),
    row.date.trim(),
    row.engineer.trim(),
    row.projectHistory.trim(),
    row.partialInvoiceDate.trim(),
    row.invoicedDate.trim(),
    row.finalReportSentOn.trim(),
    row.projectCompleted.trim(),
    row.labelsShipped.trim(),
  ];
}

export function CompletedProjectsPanel() {
  const [rows, setRows] = useState<CompletedProjectEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSort>("name");
  const [exportDropdownOpen, setExportDropdownOpen] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const exportMenuRef = useRef<HTMLDivElement | null>(null);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const exportMenuId = useId();
  const pageSize = useFitPageSize(
    tableWrapRef,
    { rowHeight: 42, minRows: 6, maxRows: 50 },
    ready,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      try {
        const response = await fetch("/api/completed-projects", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Could not load completed projects.");
        }
        const data = (await response.json()) as {
          completedProjects?: CompletedProjectEntry[];
        };
        if (!cancelled) {
          setRows(
            sortCompletedProjectsNewestFirst(data.completedProjects ?? []),
          );
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load completed projects.",
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
    const filtered = rows.filter((row) => matchesCompletedQuery(row, query));
    return sortByListSort(filtered, sort, (row) => row.displayId);
  }, [rows, query, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, sort]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * pageSize;
  const pageRows = visibleRows.slice(pageStart, pageStart + pageSize);

  function toggleSelect(id: string) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function toggleSelectAllVisible(visible: CompletedProjectEntry[]) {
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

  async function persistRows(next: CompletedProjectEntry[]) {
    const response = await fetch("/api/completed-projects", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ completedProjects: next }),
    });
    const data = (await response.json()) as {
      error?: string;
      completedProjects?: CompletedProjectEntry[];
    };
    if (!response.ok) {
      throw new Error(data.error || "Failed to save completed projects.");
    }
    return sortCompletedProjectsNewestFirst(
      data.completedProjects ?? next,
    );
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }
    const lead =
      selectedIds.length === 1
        ? "Delete the selected completed project row?"
        : `Delete ${selectedIds.length} selected completed project rows?`;
    if (
      !window.confirm(
        `${lead}\n\nThis only removes rows from Completed Projects. Project Naming, Active Projects, Project History, and Invoicing History are not changed.`,
      )
    ) {
      return;
    }

    const selectedSet = new Set(selectedIds);
    const next = sortCompletedProjectsNewestFirst(
      rows.filter((row) => !selectedSet.has(row.id)),
    );

    setError(null);
    try {
      setRows(await persistRows(next));
      setSelectedIds([]);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete projects.",
      );
    }
  }

  function handleExport(format: "excel" | "pdf" | "csv") {
    setExportError(null);
    try {
      const exportRows = visibleRows.map(rowToExportCells);
      if (format === "excel") {
        exportTableAsExcel(
          EXPORT_HEADERS,
          exportRows,
          "completed-projects",
          "Completed Projects",
        );
      } else if (format === "pdf") {
        exportTableAsPdf("Completed Projects", EXPORT_HEADERS, exportRows);
      } else {
        exportTableAsCsv(EXPORT_HEADERS, exportRows, "completed-projects");
      }
      setExportDropdownOpen(false);
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : "Failed to export completed projects.",
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
      const engineerIdx = indexOf("project engineer", "zproject engineer");
      const historyIdx = indexOf("project history");
      const partialIdx = indexOf(
        "partial invoice date",
        "z.partial invoice date",
      );
      const invoicedIdx = indexOf("invoiced date");
      const finalIdx = indexOf("final report sent on");
      const completedIdx = indexOf("project completed");
      const labelsIdx = indexOf("labels shipped");

      if (idIdx < 0 && nameIdx < 0) {
        throw new Error(
          "No recognized columns. Export first and use those headers.",
        );
      }

      const next = [...rows];
      let created = 0;
      let updated = 0;

      for (const row of parsed.slice(1)) {
        const displayId = (row[idIdx] ?? "").trim();
        const projectName = (row[nameIdx] ?? "").trim();
        if (!displayId && !projectName) {
          continue;
        }

        const values = {
          displayId,
          customer: (row[customerIdx] ?? "").trim(),
          projectName,
          date: (row[dateIdx] ?? "").trim(),
          engineer: (row[engineerIdx] ?? "").trim(),
          projectHistory: (row[historyIdx] ?? "").trim(),
          partialInvoiceDate: (row[partialIdx] ?? "").trim(),
          invoicedDate: (row[invoicedIdx] ?? "").trim(),
          finalReportSentOn: (row[finalIdx] ?? "").trim(),
          projectCompleted: (row[completedIdx] ?? "").trim(),
          labelsShipped: (row[labelsIdx] ?? "").trim(),
        };

        const existingIndex = next.findIndex((item) => {
          if (
            displayId &&
            item.displayId.trim().toLowerCase() === displayId.toLowerCase()
          ) {
            return true;
          }
          return (
            !displayId &&
            item.projectName.trim().toLowerCase() ===
              projectName.toLowerCase()
          );
        });

        if (existingIndex >= 0) {
          const existing = next[existingIndex]!;
          next[existingIndex] = normalizeCompletedProject({
            ...existing,
            ...values,
            id: existing.id,
          });
          updated += 1;
        } else {
          next.push(
            normalizeCompletedProject({
              id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
              ...values,
            }),
          );
          created += 1;
        }
      }

      if (created === 0 && updated === 0) {
        throw new Error(
          "No valid rows found. ID or Project Name is required.",
        );
      }

      setRows(await persistRows(sortCompletedProjectsNewestFirst(next)));
      window.alert(
        `Imported ${created + updated} completed project${
          created + updated === 1 ? "" : "s"
        } (${created} added, ${updated} updated).`,
      );
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Failed to import completed projects.",
      );
    } finally {
      setImporting(false);
      if (importInputRef.current) {
        importInputRef.current.value = "";
      }
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
                aria-label="Export completed projects"
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
              disabled={importing}
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
        <p className="table-empty">Loading completed projects…</p>
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
                      aria-label="Select all completed projects on this page"
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
                        ? "No completed projects match this search."
                        : "No completed projects yet. Mark Project Completed on Active Projects or Close Projects, or use Import."}
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
                        <td>
                          <span className="table-preview-text">
                            {cell(row.projectHistory)}
                          </span>
                        </td>
                        <td>{cell(row.partialInvoiceDate)}</td>
                        <td>{cell(row.invoicedDate)}</td>
                        <td>{cell(row.finalReportSentOn)}</td>
                        <td>{formatDateLabel(row.projectCompleted)}</td>
                        <td>{cell(row.labelsShipped)}</td>
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
    </section>
  );
}
