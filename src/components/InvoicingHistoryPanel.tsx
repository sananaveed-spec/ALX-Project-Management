"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
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
import {
  filterInvoicingHistoryRows,
  isPartialOrFullInvoiced,
  normalizeProjectDetail,
  partialInvoicesDisplay,
  type ProjectDetailEntry,
} from "@/lib/project-details";
import { useFitPageSize } from "@/lib/use-fit-page-size";

const TABLE_HEADERS = [
  "ID",
  "Customer",
  "Project Name",
  "Status",
  "Partial Invoices",
  "Full Invoice",
] as const;

const EXPORT_HEADERS = [
  "ID",
  "Customer",
  "Project Name",
  "Status",
  "Invoiced",
  "Partial Invoices",
  "Full Invoice",
] as const;

function cell(value: string) {
  return value.trim() ? value : "—";
}

function matchesInvoicingQuery(row: ProjectDetailEntry, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  const haystack = [
    row.displayId,
    row.customer,
    row.projectName,
    row.status,
    row.invoiced,
    partialInvoicesDisplay(row),
    row.fullInvoicedDate,
  ]
    .join(" ")
    .toLowerCase();
  return haystack.includes(q);
}

function clearInvoicingFields(row: ProjectDetailEntry): ProjectDetailEntry {
  return {
    ...row,
    invoiced: "",
    partialInvoicingDate: "",
    fullInvoicedDate: "",
    partialInvoiceHistory: "",
    readyToInvoiceDate: "",
  };
}

function inferInvoicedStatus(input: {
  invoiced: string;
  partialInvoices: string;
  fullInvoice: string;
}): string {
  const explicit = input.invoiced.trim().toUpperCase().replace(/\s+/g, " ");
  if (explicit === "FULL" || explicit === "PARTIAL") {
    return explicit;
  }
  if (input.fullInvoice.trim()) {
    return "FULL";
  }
  if (input.partialInvoices.trim()) {
    return "PARTIAL";
  }
  return "";
}

export function InvoicingHistoryPanel() {
  const [rows, setRows] = useState<ProjectDetailEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSort>("name");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
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
        const [activeResponse, closedResponse] = await Promise.all([
          fetch("/api/project-details", { cache: "no-store" }),
          fetch("/api/closed-projects", { cache: "no-store" }),
        ]);
        if (!activeResponse.ok) {
          throw new Error("Could not load invoicing history.");
        }
        const activeData = (await activeResponse.json()) as {
          projectDetails?: ProjectDetailEntry[];
        };
        const closedData = closedResponse.ok
          ? ((await closedResponse.json()) as {
              closedProjects?: ProjectDetailEntry[];
            })
          : { closedProjects: [] };
        if (!cancelled) {
          setRows(
            filterInvoicingHistoryRows([
              ...(activeData.projectDetails ?? []),
              ...(closedData.closedProjects ?? []),
            ]),
          );
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load invoicing history.",
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
    const filtered = rows.filter((row) => matchesInvoicingQuery(row, query));
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

  function toggleSelectAllVisible(visible: ProjectDetailEntry[]) {
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

  async function loadAllDetails(): Promise<ProjectDetailEntry[]> {
    const response = await fetch("/api/project-details", {
      cache: "no-store",
    });
    if (!response.ok) {
      throw new Error("Could not load projects to update.");
    }
    const data = (await response.json()) as {
      projectDetails?: ProjectDetailEntry[];
    };
    return data.projectDetails ?? [];
  }

  async function saveAllDetails(
    nextDetails: ProjectDetailEntry[],
  ): Promise<ProjectDetailEntry[]> {
    const saveResponse = await fetch("/api/project-details", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projectDetails: nextDetails }),
    });
    const saveData = (await saveResponse.json()) as {
      error?: string;
      projectDetails?: ProjectDetailEntry[];
    };
    if (!saveResponse.ok) {
      throw new Error(saveData.error || "Failed to save invoicing changes.");
    }
    return saveData.projectDetails ?? nextDetails;
  }

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }
    const lead =
      selectedIds.length === 1
        ? "Remove the selected row from Invoicing History?"
        : `Remove ${selectedIds.length} selected rows from Invoicing History?`;
    if (
      !window.confirm(
        `${lead}\n\nThis clears PARTIAL/FULL invoice status for those projects. Project Naming and Active Projects stay; they will leave Invoicing History.`,
      )
    ) {
      return;
    }

    const selectedSet = new Set(selectedIds);
    setError(null);
    try {
      const allRows = await loadAllDetails();
      const nextDetails = allRows.map((row) =>
        selectedSet.has(row.id) ? clearInvoicingFields(row) : row,
      );
      const saved = await saveAllDetails(nextDetails);
      setRows(filterInvoicingHistoryRows(saved));
      setSelectedIds([]);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to remove from invoicing history.",
      );
    }
  }

  function handleExport(format: "excel" | "pdf" | "csv") {
    setExportError(null);
    try {
      const exportRows = visibleRows.map((row) => [
        row.displayId.trim(),
        row.customer.trim(),
        row.projectName.trim(),
        row.status.trim(),
        row.invoiced.trim(),
        partialInvoicesDisplay(row).trim(),
        row.fullInvoicedDate.trim(),
      ]);
      if (format === "excel") {
        exportTableAsExcel(
          [...EXPORT_HEADERS],
          exportRows,
          "invoicing-history",
          "Invoicing History",
        );
      } else if (format === "pdf") {
        exportTableAsPdf(
          "Invoicing History",
          [...EXPORT_HEADERS],
          exportRows,
        );
      } else {
        exportTableAsCsv(
          [...EXPORT_HEADERS],
          exportRows,
          "invoicing-history",
        );
      }
      setExportDropdownOpen(false);
    } catch (err) {
      setExportError(
        err instanceof Error
          ? err.message
          : "Failed to export invoicing history.",
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
      const statusIdx = indexOf("status");
      const invoicedIdx = indexOf("invoiced");
      const partialIdx = indexOf(
        "partial invoices",
        "partial invoice history",
        "partial invoicing date",
      );
      const fullIdx = indexOf(
        "full invoice",
        "full invoice (100%)",
        "full invoiced date",
      );

      if (idIdx < 0) {
        throw new Error(
          "No ID column found. Export first and use those headers.",
        );
      }

      const allRows = await loadAllDetails();
      const byDisplayId = new Map(
        allRows.map((row) => [row.displayId.trim().toLowerCase(), row]),
      );

      let updated = 0;
      let skipped = 0;

      for (const row of parsed.slice(1)) {
        const displayId = (row[idIdx] ?? "").trim();
        if (!displayId) {
          continue;
        }

        const existing = byDisplayId.get(displayId.toLowerCase());
        if (!existing) {
          skipped += 1;
          continue;
        }

        const partialInvoices = (row[partialIdx] ?? "").trim();
        const fullInvoice = (row[fullIdx] ?? "").trim();
        const status = (row[statusIdx] ?? "").trim();
        const invoiced = inferInvoicedStatus({
          invoiced: (row[invoicedIdx] ?? "").trim(),
          partialInvoices,
          fullInvoice,
        });

        if (!isPartialOrFullInvoiced(invoiced) && !partialInvoices && !fullInvoice) {
          skipped += 1;
          continue;
        }

        const nextInvoiced = isPartialOrFullInvoiced(invoiced)
          ? invoiced.trim().toUpperCase().replace(/\s+/g, " ")
          : fullInvoice
            ? "FULL"
            : "PARTIAL";

        const updatedRow = normalizeProjectDetail({
          ...existing,
          status: status || existing.status,
          invoiced: nextInvoiced,
          partialInvoiceHistory: partialInvoices || existing.partialInvoiceHistory,
          partialInvoicingDate: partialInvoices
            ? ""
            : existing.partialInvoicingDate,
          fullInvoicedDate: fullInvoice || existing.fullInvoicedDate,
        });

        byDisplayId.set(displayId.toLowerCase(), updatedRow);
        updated += 1;
      }

      if (updated === 0) {
        throw new Error(
          skipped > 0
            ? "No matching Active Projects found for imported IDs."
            : "No valid invoicing rows found in the file.",
        );
      }

      const nextDetails = allRows.map(
        (row) =>
          byDisplayId.get(row.displayId.trim().toLowerCase()) ?? row,
      );
      const saved = await saveAllDetails(nextDetails);
      setRows(filterInvoicingHistoryRows(saved));
      window.alert(
        `Updated ${updated} project${updated === 1 ? "" : "s"} on Invoicing History` +
          (skipped ? ` (${skipped} skipped).` : "."),
      );
    } catch (importError) {
      setError(
        importError instanceof Error
          ? importError.message
          : "Failed to import invoicing history.",
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
                placeholder="ID, customer, project name, status…"
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
                aria-label="Export invoicing history"
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
        <p className="table-empty">Loading invoicing history…</p>
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
                      aria-label="Select all invoicing rows on this page"
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
                        ? "No invoicing rows match this search."
                        : "No PARTIAL or FULL invoiced projects yet. Use Import or mark invoices on Active Projects."}
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
                        <td>{cell(row.status)}</td>
                        <td>
                          <span className="table-preview-text">
                            {cell(partialInvoicesDisplay(row))}
                          </span>
                        </td>
                        <td>
                          <span className="table-preview-text">
                            {cell(row.fullInvoicedDate)}
                          </span>
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
    </section>
  );
}
