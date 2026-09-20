"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { type ProjectDetailEntry } from "@/lib/project-details";
import { filterTodayToDoRows } from "@/lib/project-history";

const PAGE_SIZE = 50;

const TABLE_HEADERS = [
  "Done",
  "Done with change",
  "REMINDER",
  "REMINDER DATE",
  "PROJECT NAME",
  "ENGINEER",
  "STATUS",
  "INVOICED",
  "RECENT ACTIVITY",
  "DATE",
] as const;

type WizardState =
  | {
      kind: "clear";
      rowId: string;
      projectLabel: string;
      comments: string;
    }
  | {
      kind: "reschedule-date";
      rowId: string;
      projectLabel: string;
      newDate: string;
    }
  | {
      kind: "reschedule-comments";
      rowId: string;
      projectLabel: string;
      newDate: string;
      comments: string;
    };

function cell(value: string) {
  return value.trim() ? value : "—";
}

function formatDateLabel(value: string) {
  if (!value.trim()) {
    return "—";
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

export function TodayToDoPanel() {
  const [rows, setRows] = useState<ProjectDetailEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [wizard, setWizard] = useState<WizardState | null>(null);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);
  const titleId = useId();
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const dateInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      try {
        const response = await fetch("/api/today-todo", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Could not load today to-do list.");
        }
        const data = (await response.json()) as {
          todayToDo?: ProjectDetailEntry[];
          projectDetails?: ProjectDetailEntry[];
        };
        if (!cancelled) {
          setRows(
            data.todayToDo ??
              filterTodayToDoRows(data.projectDetails ?? []),
          );
          setPage(1);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load today to-do list.",
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
    if (!wizard) {
      return;
    }
    const timer = window.setTimeout(() => {
      if (wizard.kind === "reschedule-date") {
        dateInputRef.current?.focus();
      } else {
        textAreaRef.current?.focus();
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [wizard]);

  async function submitClear() {
    if (!wizard || wizard.kind !== "clear") {
      return;
    }
    const comments = wizard.comments.trim();
    if (!comments) {
      setError("Please enter actions taken.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/today-todo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "clear",
          projectId: wizard.rowId,
          comments,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        todayToDo?: ProjectDetailEntry[];
      };
      if (!response.ok) {
        throw new Error(data.error || "Failed to clear reminder.");
      }
      setRows(data.todayToDo ?? []);
      setWizard(null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to clear reminder.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function submitReschedule() {
    if (!wizard || wizard.kind !== "reschedule-comments") {
      return;
    }
    const comments = wizard.comments.trim();
    if (!comments) {
      setError("Please enter actions taken.");
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/today-todo", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "reschedule",
          projectId: wizard.rowId,
          comments,
          newReminderDate: wizard.newDate,
        }),
      });
      const data = (await response.json()) as {
        error?: string;
        todayToDo?: ProjectDetailEntry[];
      };
      if (!response.ok) {
        throw new Error(data.error || "Failed to reschedule reminder.");
      }
      setRows(data.todayToDo ?? []);
      setWizard(null);
    } catch (submitError) {
      setError(
        submitError instanceof Error
          ? submitError.message
          : "Failed to reschedule reminder.",
      );
    } finally {
      setSaving(false);
    }
  }

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
        <p className="table-empty">Loading today to-do list…</p>
      ) : (
        <>
          <div className="table-wrap">
            <table className="projects-table projects-table--wide">
              <thead>
                <tr>
                  {TABLE_HEADERS.map((header) => (
                    <th key={header}>{header}</th>
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
                      No due reminders. Set PM Action Items Date on Projects to
                      today or earlier.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => {
                    const active =
                      wizard?.rowId === row.id ||
                      (saving && wizard?.rowId === row.id);
                    return (
                      <tr key={row.id}>
                        <td className="table-complete-cell">
                          <input
                            type="checkbox"
                            className="table-complete-checkbox"
                            checked={wizard?.kind === "clear" && active}
                            disabled={saving}
                            aria-label={`Done for ${row.projectName || row.displayId}`}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setWizard({
                                  kind: "clear",
                                  rowId: row.id,
                                  projectLabel:
                                    row.displayId ||
                                    row.projectName ||
                                    "Project",
                                  comments: "",
                                });
                              } else if (
                                wizard?.kind === "clear" &&
                                wizard.rowId === row.id
                              ) {
                                setWizard(null);
                              }
                            }}
                          />
                        </td>
                        <td className="table-complete-cell">
                          <input
                            type="checkbox"
                            className="table-complete-checkbox"
                            checked={
                              (wizard?.kind === "reschedule-date" ||
                                wizard?.kind === "reschedule-comments") &&
                              active
                            }
                            disabled={saving}
                            aria-label={`Done with change for ${row.projectName || row.displayId}`}
                            onChange={(event) => {
                              if (event.target.checked) {
                                setWizard({
                                  kind: "reschedule-date",
                                  rowId: row.id,
                                  projectLabel:
                                    row.displayId ||
                                    row.projectName ||
                                    "Project",
                                  newDate: "",
                                });
                              } else if (
                                wizard &&
                                wizard.rowId === row.id &&
                                (wizard.kind === "reschedule-date" ||
                                  wizard.kind === "reschedule-comments")
                              ) {
                                setWizard(null);
                              }
                            }}
                          />
                        </td>
                        <td>
                          <span className="table-preview-text">
                            {cell(row.pmActionItems)}
                          </span>
                        </td>
                        <td>{formatDateLabel(row.pmActionItemsDate)}</td>
                        <td>{cell(row.projectName)}</td>
                        <td>{cell(row.engineer)}</td>
                        <td>{cell(row.status)}</td>
                        <td>{cell(row.invoiced)}</td>
                        <td>
                          <span className="table-preview-text">
                            {cell(row.recentActivity)}
                          </span>
                        </td>
                        <td>{formatDateLabel(row.recentActivityDate)}</td>
                      </tr>
                    );
                  })
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

      {mounted && wizard
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
                    {wizard.kind === "clear"
                      ? "Actions Taken"
                      : wizard.kind === "reschedule-date"
                        ? "Select a date for task completion"
                        : "Actions Taken"}
                  </h2>
                  <button
                    type="button"
                    className="dialog-close"
                    aria-label="Close"
                    disabled={saving}
                    onClick={() => setWizard(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="dialog-subtitle">{wizard.projectLabel}</p>

                {wizard.kind === "clear" ? (
                  <>
                    <label className="field">
                      <span className="field-label">Please enter actions taken</span>
                      <textarea
                        ref={textAreaRef}
                        className="field-input notes-editor"
                        rows={6}
                        value={wizard.comments}
                        disabled={saving}
                        onChange={(event) =>
                          setWizard({
                            ...wizard,
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
                        onClick={() => setWizard(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={saving || !wizard.comments.trim()}
                        onClick={() => void submitClear()}
                      >
                        {saving ? "Saving…" : "OK"}
                      </button>
                    </div>
                  </>
                ) : null}

                {wizard.kind === "reschedule-date" ? (
                  <>
                    <label className="field">
                      <span className="field-label">
                        Enter the date (new reminder date)
                      </span>
                      <input
                        ref={dateInputRef}
                        className="field-input field-date"
                        type="date"
                        value={wizard.newDate}
                        disabled={saving}
                        onChange={(event) =>
                          setWizard({
                            ...wizard,
                            newDate: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="dialog-actions">
                      <button
                        type="button"
                        className="button secondary"
                        disabled={saving}
                        onClick={() => setWizard(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={saving || !wizard.newDate}
                        onClick={() =>
                          setWizard({
                            kind: "reschedule-comments",
                            rowId: wizard.rowId,
                            projectLabel: wizard.projectLabel,
                            newDate: wizard.newDate,
                            comments: "",
                          })
                        }
                      >
                        Next
                      </button>
                    </div>
                  </>
                ) : null}

                {wizard.kind === "reschedule-comments" ? (
                  <>
                    <p className="dialog-subtitle">
                      New reminder date: {formatDateLabel(wizard.newDate)}
                    </p>
                    <label className="field">
                      <span className="field-label">Please provide actions taken</span>
                      <textarea
                        ref={textAreaRef}
                        className="field-input notes-editor"
                        rows={6}
                        value={wizard.comments}
                        disabled={saving}
                        onChange={(event) =>
                          setWizard({
                            ...wizard,
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
                        onClick={() => setWizard(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={saving || !wizard.comments.trim()}
                        onClick={() => void submitReschedule()}
                      >
                        {saving ? "Saving…" : "OK"}
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}
