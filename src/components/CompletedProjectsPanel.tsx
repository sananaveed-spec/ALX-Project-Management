"use client";

import { useEffect, useMemo, useState } from "react";
import {
  cascadeDeleteByUniqueIds,
  confirmCascadeProjectDelete,
} from "@/lib/cascade-delete-client";
import {
  sortCompletedProjectsNewestFirst,
  type CompletedProjectEntry,
} from "@/lib/completed-projects";
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
  "Date",
  "Project Engineer",
  "PROJECT HISTORY",
  "Partial Invoice Date",
  "Invoiced Date",
  "Final Report Sent on",
  "Project Completed",
  "Labels Shipped",
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

export function CompletedProjectsPanel() {
  const [rows, setRows] = useState<CompletedProjectEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<ListSort>("name");

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

  const visibleRows = useMemo(() => {
    const filtered = rows.filter((row) => matchesCompletedQuery(row, query));
    return sortByListSort(filtered, sort, (row) => row.displayId);
  }, [rows, query, sort]);

  useEffect(() => {
    setPage(1);
  }, [query, sort]);

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = visibleRows.slice(pageStart, pageStart + PAGE_SIZE);

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

  async function handleDeleteSelected() {
    if (selectedIds.length === 0) {
      return;
    }
    if (!confirmCascadeProjectDelete(selectedIds.length)) {
      return;
    }

    const selectedSet = new Set(selectedIds);
    const uniqueIds = rows
      .filter((row) => selectedSet.has(row.id))
      .map((row) => row.displayId);

    setError(null);
    try {
      const data = await cascadeDeleteByUniqueIds(uniqueIds);
      setRows(
        sortCompletedProjectsNewestFirst(
          Array.isArray(data.completedProjects)
            ? (data.completedProjects as CompletedProjectEntry[])
            : rows.filter((row) => !selectedSet.has(row.id)),
        ),
      );
      setSelectedIds([]);
    } catch (deleteError) {
      setError(
        deleteError instanceof Error
          ? deleteError.message
          : "Failed to delete projects.",
      );
    }
  }

  return (
    <section className="content-panel content-panel--actions">
      {ready ? (
        <div className="table-toolbar customer-toolbar">
          <label className="field history-search-field">
            <span className="field-label">Search</span>
            <input
              className="field-input"
              type="search"
              placeholder="ID, customer, project name, engineer…"
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
        <p className="table-empty">Loading completed projects…</p>
      ) : (
        <>
          <div className="table-toolbar">
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

          <div className="table-wrap">
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
                        : "No completed projects yet. Mark Project Completed on the Active Projects tab."}
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
