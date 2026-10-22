"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  filterInvoicingHistoryRows,
  partialInvoicesDisplay,
  type ProjectDetailEntry,
} from "@/lib/project-details";
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
  "Status",
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

export function InvoicingHistoryPanel() {
  const [rows, setRows] = useState<ProjectDetailEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSort>("name");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const tableWrapRef = useRef<HTMLDivElement | null>(null);
  const pageSize = useFitPageSize(
    tableWrapRef,
    { rowHeight: 42, minRows: 6, maxRows: 50 },
    ready,
  );

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      try {
        const response = await fetch("/api/project-details", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Could not load invoicing history.");
        }
        const data = (await response.json()) as {
          projectDetails?: ProjectDetailEntry[];
        };
        if (!cancelled) {
          setRows(filterInvoicingHistoryRows(data.projectDetails ?? []));
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

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => matchesInvoicingQuery(row, query));
    return sortByListSort(filtered, sort, (row) => row.displayId);
  }, [rows, query, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, sort, pageSize]);

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
      const response = await fetch("/api/project-details", {
        cache: "no-store",
      });
      if (!response.ok) {
        throw new Error("Could not load projects to update.");
      }
      const data = (await response.json()) as {
        projectDetails?: ProjectDetailEntry[];
      };
      const allRows = data.projectDetails ?? [];
      const nextDetails = allRows.map((row) =>
        selectedSet.has(row.id) ? clearInvoicingFields(row) : row,
      );

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
        throw new Error(saveData.error || "Failed to remove from history.");
      }

      setRows(
        filterInvoicingHistoryRows(saveData.projectDetails ?? nextDetails),
      );
      setSelectedIds([]);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to remove from invoicing history.",
      );
    }
  }

  return (
    <section className="content-panel content-panel--actions">
      {ready ? (
        <div className="action-row">
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
          <button
            type="button"
            className="button danger"
            disabled={selectedIds.length === 0}
            onClick={() => void handleDeleteSelected()}
          >
            Delete
            {selectedIds.length > 0 ? ` (${selectedIds.length})` : ""}
          </button>
        </div>
      ) : null}

      {error ? (
        <p className="form-message error" role="alert">
          {error}
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
                        : "No PARTIAL or FULL invoiced projects yet."}
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
