"use client";

import { useEffect, useState } from "react";
import {
  sortCompletedProjectsNewestFirst,
  type CompletedProjectEntry,
} from "@/lib/completed-projects";

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

export function CompletedProjectsPanel() {
  const [rows, setRows] = useState<CompletedProjectEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <section className="content-panel content-panel--actions">
      <h2 className="section-title">Completed Projects</h2>

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading completed projects…</p>
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
                      No completed projects yet. Mark Project Completed on the
                      Projects tab.
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
                  ({pageStart + 1}–
                  {Math.min(pageStart + PAGE_SIZE, rows.length)} of{" "}
                  {rows.length})
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
