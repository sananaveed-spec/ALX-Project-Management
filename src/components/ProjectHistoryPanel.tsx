"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type ProjectDetailEntry } from "@/lib/project-details";
import { type ProjectHistoryEntry } from "@/lib/project-history";

const PAGE_SIZE = 50;

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
  const [page, setPage] = useState(1);
  const [logWizard, setLogWizard] = useState<LogWizard | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
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

  const filtered = useMemo(
    () => rows.filter((row) => matchesQuery(row, query)),
    [rows, query],
  );

  useEffect(() => {
    setPage(1);
  }, [query]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = filtered.slice(pageStart, pageStart + PAGE_SIZE);

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
      <div className="action-row">
        <label className="field history-search-field">
          <span className="field-label">Search</span>
          <input
            className="field-input"
            type="search"
            placeholder="ID, customer, project name, comments…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
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
      </div>

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading project history…</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="projects-table projects-table--wide">
              <thead>
                <tr>
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
                      colSpan={TABLE_HEADERS.length}
                      className="table-empty-cell"
                    >
                      {query.trim()
                        ? "No history rows match this search."
                        : "No history yet. Complete a Today To-Do item or use Log Action."}
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
