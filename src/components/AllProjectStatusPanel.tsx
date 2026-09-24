"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ALL_PROJECT_STATUS_PHASES,
  buildAllProjectStatusRows,
  formatStatusPercent,
  type AllProjectStatusRow,
} from "@/lib/all-project-status";
import type { CompletedProjectEntry } from "@/lib/completed-projects";
import type { ProjectDetailEntry } from "@/lib/project-details";

const PAGE_SIZE = 50;

const TABLE_HEADERS = [
  "ID",
  "Customer",
  "Project Name",
  "Status",
  "%",
  "Phase",
] as const;

type PhaseFilter = "all" | (typeof ALL_PROJECT_STATUS_PHASES)[number];

function cell(value: string) {
  return value.trim() ? value : "—";
}

function matchesQuery(row: AllProjectStatusRow, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return (
    row.displayId.toLowerCase().includes(q) ||
    row.customer.toLowerCase().includes(q) ||
    row.projectName.toLowerCase().includes(q) ||
    row.status.toLowerCase().includes(q) ||
    row.phase.toLowerCase().includes(q)
  );
}

export function AllProjectStatusPanel() {
  const [rows, setRows] = useState<AllProjectStatusRow[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState("");
  const [phaseFilter, setPhaseFilter] = useState<PhaseFilter>("all");

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      try {
        const [activeResponse, completedResponse] = await Promise.all([
          fetch("/api/project-details", { cache: "no-store" }),
          fetch("/api/completed-projects", { cache: "no-store" }),
        ]);
        if (!activeResponse.ok) {
          throw new Error("Could not load projects.");
        }
        if (!completedResponse.ok) {
          throw new Error("Could not load completed projects.");
        }
        const activeData = (await activeResponse.json()) as {
          projectDetails?: ProjectDetailEntry[];
        };
        const completedData = (await completedResponse.json()) as {
          completedProjects?: CompletedProjectEntry[];
        };
        if (!cancelled) {
          setRows(
            buildAllProjectStatusRows({
              active: activeData.projectDetails ?? [],
              completed: completedData.completedProjects ?? [],
            }),
          );
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load all project status.",
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

  const filtered = useMemo(
    () =>
      rows.filter((row) => {
        if (phaseFilter !== "all" && row.phase !== phaseFilter) {
          return false;
        }
        return matchesQuery(row, query);
      }),
    [rows, query, phaseFilter],
  );

  useEffect(() => {
    setPage(1);
  }, [query, phaseFilter]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

  return (
    <section className="content-panel content-panel--actions">
      <div className="table-toolbar">
        <label className="field" style={{ margin: 0, flex: 1, maxWidth: "22rem" }}>
          <span className="field-label">Search</span>
          <input
            className="field-input"
            type="search"
            value={query}
            placeholder="ID, customer, name, status, or phase"
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
        <label className="field" style={{ margin: 0, minWidth: "12rem" }}>
          <span className="field-label">Phase</span>
          <select
            className="field-input field-select"
            value={phaseFilter}
            onChange={(event) =>
              setPhaseFilter(event.target.value as PhaseFilter)
            }
            aria-label="Filter by phase"
          >
            <option value="all">All phases</option>
            {ALL_PROJECT_STATUS_PHASES.map((phase) => (
              <option key={phase} value={phase}>
                {phase}
              </option>
            ))}
          </select>
        </label>
      </div>

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading all project status…</p>
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
                      {query.trim() || phaseFilter !== "all"
                        ? "No matching projects."
                        : "No projects yet."}
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
                      <td>{formatStatusPercent(row.percent)}</td>
                      <td>{cell(row.phase)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>

          {filtered.length > PAGE_SIZE ? (
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
                  {Math.min(pageStart + PAGE_SIZE, filtered.length)} of{" "}
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
    </section>
  );
}
