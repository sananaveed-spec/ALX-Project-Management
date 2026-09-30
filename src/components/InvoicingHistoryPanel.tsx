"use client";

import { useEffect, useMemo, useState } from "react";
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

const PAGE_SIZE = 50;

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

export function InvoicingHistoryPanel() {
  const [rows, setRows] = useState<ProjectDetailEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSort>("name");

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
  }, [query, sort]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = visibleRows.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <section className="content-panel content-panel--actions">
      {ready ? (
        <div className="table-toolbar customer-toolbar">
          <label className="field history-search-field">
            <span className="field-label">Search</span>
            <input
              className="field-input"
              type="search"
              placeholder="ID, customer, project name, status…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </label>
          <label className="field customer-sort-field">
            <span className="field-label">Sort</span>
            <select
              className="field-input"
              value={sort}
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
          <div className="table-wrap">
            <table className="projects-table projects-table--wide">
              <thead>
                <tr>
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
                      colSpan={TABLE_HEADERS.length}
                      className="table-empty-cell"
                    >
                      {query.trim()
                        ? "No invoicing rows match this search."
                        : "No PARTIAL or FULL invoiced projects yet."}
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
                  ))
                )}
              </tbody>
            </table>
          </div>

          {visibleRows.length > PAGE_SIZE ? (
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
                  {Math.min(pageStart + PAGE_SIZE, visibleRows.length)} of{" "}
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
