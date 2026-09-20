"use client";

import { useEffect, useState } from "react";
import {
  filterInvoicingHistoryRows,
  partialInvoicesDisplay,
  type ProjectDetailEntry,
} from "@/lib/project-details";

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

export function InvoicingHistoryPanel() {
  const [rows, setRows] = useState<ProjectDetailEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);

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

  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = rows.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <section className="content-panel content-panel--actions">
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
                      No PARTIAL or FULL invoices yet. Mark invoiced from Ready
                      to Invoice or set Invoiced on Projects.
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
                      <td>{cell(row.invoiced)}</td>
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
