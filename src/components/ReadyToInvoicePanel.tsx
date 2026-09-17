"use client";

import { useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import {
  appendPartialInvoiceHistory,
  formatFullInvoiceNote,
  isReadyToInvoice,
  sortProjectDetailsNewestFirst,
  type ProjectDetailEntry,
} from "@/lib/project-details";

const PAGE_SIZE = 50;

const TABLE_HEADERS = [
  "Mark invoiced",
  "ID",
  "Customer",
  "Project Name",
  "Date",
  "Project Engineer",
  "Status",
  "Partial Invoice History",
  "PM Comments",
] as const;

type MultilineField = "partialInvoiceHistory" | "pmComments";

type EditableField = MultilineField | "readyToInvoiceDate";

type MultilineEditorState = {
  rowId: string;
  field: MultilineField;
  label: string;
  projectLabel: string;
  draft: string;
};

type InvoiceWizardState =
  | {
      step: "askFull";
      rowId: string;
      projectLabel: string;
    }
  | {
      step: "fullNumber";
      rowId: string;
      projectLabel: string;
      draft: string;
    }
  | {
      step: "partialPercent";
      rowId: string;
      projectLabel: string;
      draft: string;
    }
  | {
      step: "partialNumber";
      rowId: string;
      projectLabel: string;
      percent: string;
      draft: string;
    };

function cell(value: string) {
  return value.trim() ? value : "—";
}

function savingKeyFor(rowId: string, field: EditableField) {
  return `${rowId}:${field}`;
}

function previewText(value: string) {
  const trimmed = value.replace(/\s+$/g, "");
  return trimmed.trim() ? trimmed : "";
}

function formatDateLabel(value: string) {
  if (!value.trim()) {
    return "Select date";
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

function openNativeDatePicker(input: HTMLInputElement | null) {
  if (!input || input.disabled) {
    return;
  }
  input.focus();
  const picker = (
    input as HTMLInputElement & { showPicker?: () => void }
  ).showPicker;
  if (typeof picker === "function") {
    try {
      picker.call(input);
    } catch {
      // ignore
    }
  }
}

export function ReadyToInvoicePanel() {
  const [rows, setRows] = useState<ProjectDetailEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [invoicingId, setInvoicingId] = useState<string | null>(null);
  const [multilineEditor, setMultilineEditor] =
    useState<MultilineEditorState | null>(null);
  const [invoiceWizard, setInvoiceWizard] = useState<InvoiceWizardState | null>(
    null,
  );
  const [mounted, setMounted] = useState(false);
  const persistedRowsRef = useRef<ProjectDetailEntry[]>([]);
  const editorTitleId = useId();
  const invoiceTitleId = useId();
  const editorTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const invoiceInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function loadRows() {
      try {
        const response = await fetch("/api/project-details", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Could not load ready-to-invoice projects.");
        }
        const data = (await response.json()) as {
          projectDetails?: ProjectDetailEntry[];
        };
        if (!cancelled) {
          const next = sortProjectDetailsNewestFirst(data.projectDetails ?? []);
          persistedRowsRef.current = next;
          setRows(next);
          setPage(1);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load ready-to-invoice projects.",
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
    if (!multilineEditor) {
      return;
    }
    const timer = window.setTimeout(() => {
      editorTextareaRef.current?.focus();
      const el = editorTextareaRef.current;
      if (el) {
        const length = el.value.length;
        el.setSelectionRange(length, length);
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [multilineEditor?.rowId, multilineEditor?.field]);

  useEffect(() => {
    if (!invoiceWizard) {
      return;
    }
    if (
      invoiceWizard.step === "fullNumber" ||
      invoiceWizard.step === "partialPercent" ||
      invoiceWizard.step === "partialNumber"
    ) {
      const timer = window.setTimeout(() => {
        invoiceInputRef.current?.focus();
      }, 0);
      return () => window.clearTimeout(timer);
    }
  }, [invoiceWizard]);

  const visibleRows = rows.filter((row) => isReadyToInvoice(row.invoiced));

  async function persistRow(
    rowId: string,
    patch: Partial<ProjectDetailEntry> & { id: string },
    toSave: ProjectDetailEntry[],
  ) {
    const previous = persistedRowsRef.current;

    setRows(toSave);
    setError(null);

    try {
      const response = await fetch("/api/project-details", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectDetail: patch }),
      });
      const data = (await response.json()) as {
        error?: string;
        projectDetail?: ProjectDetailEntry;
      };
      if (!response.ok) {
        throw new Error(data.error || "Failed to save project.");
      }
      const saved = data.projectDetail;
      const merged = saved
        ? toSave.map((row) => (row.id === rowId ? saved : row))
        : toSave;
      persistedRowsRef.current = merged;
      setRows(merged);
      return true;
    } catch (saveError) {
      setRows(previous);
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save project.",
      );
      return false;
    }
  }

  async function handleFieldChange(
    rowId: string,
    field: EditableField,
    value: string,
  ) {
    const toSave = rows.map((row) =>
      row.id === rowId ? { ...row, [field]: value } : row,
    );
    setSavingKey(savingKeyFor(rowId, field));
    try {
      return await persistRow(rowId, { id: rowId, [field]: value }, toSave);
    } finally {
      setSavingKey(null);
    }
  }

  function openMultilineEditor(
    row: ProjectDetailEntry,
    field: MultilineField,
    label: string,
  ) {
    setMultilineEditor({
      rowId: row.id,
      field,
      label,
      projectLabel: row.displayId || row.projectName || "Project",
      draft: row[field],
    });
  }

  async function saveMultilineEditor() {
    if (!multilineEditor) {
      return;
    }
    const ok = await handleFieldChange(
      multilineEditor.rowId,
      multilineEditor.field,
      multilineEditor.draft,
    );
    if (ok) {
      setMultilineEditor(null);
    }
  }

  function startMarkInvoiced(row: ProjectDetailEntry) {
    setInvoiceWizard({
      step: "askFull",
      rowId: row.id,
      projectLabel: row.displayId || row.projectName || "Project",
    });
  }

  async function applyFullInvoice(rowId: string, invoiceNumber: string) {
    const previous = persistedRowsRef.current;
    const fullInvoicedDate = formatFullInvoiceNote(invoiceNumber);
    const patch = {
      id: rowId,
      invoiced: "FULL",
      pmComments: "",
      fullInvoicedDate,
    };
    const toSave = previous.map((row) => {
      if (row.id !== rowId) {
        return row;
      }
      return {
        ...row,
        ...patch,
      };
    });

    setInvoicingId(rowId);
    try {
      const ok = await persistRow(rowId, patch, toSave);
      if (ok) {
        setInvoiceWizard(null);
      }
    } finally {
      setInvoicingId(null);
    }
  }

  async function applyPartialInvoice(
    rowId: string,
    percentInvoiced: string,
    invoiceNumber: string,
  ) {
    const previous = persistedRowsRef.current;
    const current = previous.find((row) => row.id === rowId);
    if (!current) {
      return;
    }
    const partialInvoiceHistory = appendPartialInvoiceHistory(
      current.partialInvoiceHistory,
      invoiceNumber,
      percentInvoiced,
    );
    const patch = {
      id: rowId,
      invoiced: "PARTIAL",
      pmComments: "",
      partialInvoiceHistory,
    };
    const toSave = previous.map((row) => {
      if (row.id !== rowId) {
        return row;
      }
      return {
        ...row,
        ...patch,
      };
    });

    setInvoicingId(rowId);
    try {
      const ok = await persistRow(rowId, patch, toSave);
      if (ok) {
        setInvoiceWizard(null);
      }
    } finally {
      setInvoicingId(null);
    }
  }

  function renderDateInput(row: ProjectDetailEntry) {
    const value = row.readyToInvoiceDate;
    const disabled = savingKey === savingKeyFor(row.id, "readyToInvoiceDate");
    const inputId = `rti-date-${row.id}`;

    return (
      <div className="table-date-field">
        <button
          type="button"
          className="table-date-button"
          disabled={disabled}
          aria-label={`Date for ${row.projectName || row.displayId}`}
          onClick={() => {
            const input = document.getElementById(
              inputId,
            ) as HTMLInputElement | null;
            openNativeDatePicker(input);
          }}
        >
          <span className="table-date-button-text">{formatDateLabel(value)}</span>
          <span className="table-date-button-icon" aria-hidden="true">
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
            >
              <rect
                x="3"
                y="5"
                width="18"
                height="16"
                rx="2"
                stroke="currentColor"
                strokeWidth="1.75"
              />
              <path
                d="M3 10H21"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <path
                d="M8 3V7"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
              <path
                d="M16 3V7"
                stroke="currentColor"
                strokeWidth="1.75"
                strokeLinecap="round"
              />
            </svg>
          </span>
        </button>
        <input
          id={inputId}
          className="table-date-native-hidden"
          type="date"
          tabIndex={-1}
          name={inputId}
          autoComplete="off"
          value={value}
          disabled={disabled}
          aria-hidden="true"
          onChange={(event) =>
            void handleFieldChange(
              row.id,
              "readyToInvoiceDate",
              event.target.value,
            )
          }
        />
      </div>
    );
  }

  function renderMultilinePreview(
    row: ProjectDetailEntry,
    field: MultilineField,
    label: string,
  ) {
    const value = previewText(row[field]);
    const isSaving = savingKey === savingKeyFor(row.id, field);

    return (
      <button
        type="button"
        className="table-preview"
        disabled={isSaving}
        aria-label={`${label} for ${row.projectName || row.displayId}. Click to edit or full preview.`}
        onClick={() => openMultilineEditor(row, field, label)}
      >
        {value ? (
          <span className="table-preview-text">{value}</span>
        ) : (
          <span className="table-preview-empty">No text yet</span>
        )}
        <span className="table-preview-action">Edit / Full Preview</span>
      </button>
    );
  }

  const totalPages = Math.max(1, Math.ceil(visibleRows.length / PAGE_SIZE));
  const currentPage = Math.min(page, totalPages);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const pageRows = visibleRows.slice(pageStart, pageStart + PAGE_SIZE);
  const wizardBusy = invoicingId !== null;

  return (
    <section className="content-panel content-panel--actions">
      <h2 className="section-title">Ready to Invoice</h2>

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading projects…</p>
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
                        index >= 1 && index <= 3
                          ? `col-sticky col-sticky-${index}`
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
                      No projects ready to invoice yet. On the Projects tab, set
                      Invoiced to READY TO INVOICE.
                    </td>
                  </tr>
                ) : (
                  pageRows.map((row) => (
                    <tr key={row.id}>
                      <td className="table-complete-cell">
                        <input
                          type="checkbox"
                          className="table-complete-checkbox"
                          checked={
                            invoiceWizard?.rowId === row.id ||
                            invoicingId === row.id
                          }
                          disabled={invoicingId === row.id}
                          aria-label={`Mark invoiced for ${row.projectName || row.displayId}`}
                          onChange={(event) => {
                            if (event.target.checked) {
                              startMarkInvoiced(row);
                            } else if (invoiceWizard?.rowId === row.id) {
                              setInvoiceWizard(null);
                            }
                          }}
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
                      <td>{renderDateInput(row)}</td>
                      <td>{cell(row.engineer)}</td>
                      <td>{cell(row.status)}</td>
                      <td>
                        {renderMultilinePreview(
                          row,
                          "partialInvoiceHistory",
                          "Partial Invoice History",
                        )}
                      </td>
                      <td>
                        {renderMultilinePreview(
                          row,
                          "pmComments",
                          "PM Comments",
                        )}
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
                  {" "}
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

      {mounted && multilineEditor
        ? createPortal(
            <div className="dialog-backdrop" role="presentation">
              <div
                className="dialog-panel dialog-panel--notes"
                role="dialog"
                aria-modal="true"
                aria-labelledby={editorTitleId}
              >
                <div className="dialog-header">
                  <h2 id={editorTitleId} className="dialog-title">
                    {multilineEditor.label}
                  </h2>
                  <button
                    type="button"
                    className="dialog-close"
                    aria-label="Close"
                    onClick={() => setMultilineEditor(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="dialog-subtitle">
                  {multilineEditor.projectLabel}
                </p>
                <textarea
                  ref={editorTextareaRef}
                  className="field-input notes-editor"
                  value={multilineEditor.draft}
                  rows={Math.min(
                    24,
                    Math.max(10, multilineEditor.draft.split("\n").length + 2),
                  )}
                  placeholder={`Write ${multilineEditor.label.toLowerCase()}…`}
                  onChange={(event) =>
                    setMultilineEditor((current) =>
                      current
                        ? { ...current, draft: event.target.value }
                        : current,
                    )
                  }
                />
                <div className="dialog-actions">
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => setMultilineEditor(null)}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="button primary"
                    disabled={
                      savingKey ===
                      savingKeyFor(
                        multilineEditor.rowId,
                        multilineEditor.field,
                      )
                    }
                    onClick={() => void saveMultilineEditor()}
                  >
                    Save
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}

      {mounted && invoiceWizard
        ? createPortal(
            <div className="dialog-backdrop" role="presentation">
              <div
                className="dialog-panel"
                role="dialog"
                aria-modal="true"
                aria-labelledby={invoiceTitleId}
              >
                <div className="dialog-header">
                  <h2 id={invoiceTitleId} className="dialog-title">
                    {invoiceWizard.step === "askFull"
                      ? "Invoice Type"
                      : invoiceWizard.step === "fullNumber" ||
                          invoiceWizard.step === "partialNumber"
                        ? "Enter Invoice Number"
                        : "Enter % Invoiced"}
                  </h2>
                  <button
                    type="button"
                    className="dialog-close"
                    aria-label="Close"
                    disabled={wizardBusy}
                    onClick={() => setInvoiceWizard(null)}
                  >
                    ×
                  </button>
                </div>
                <p className="dialog-subtitle">{invoiceWizard.projectLabel}</p>

                {invoiceWizard.step === "askFull" ? (
                  <>
                    <p className="form-message">
                      Is this project Fully Invoiced?
                    </p>
                    <div className="dialog-actions">
                      <button
                        type="button"
                        className="button secondary"
                        disabled={wizardBusy}
                        onClick={() =>
                          setInvoiceWizard({
                            step: "partialPercent",
                            rowId: invoiceWizard.rowId,
                            projectLabel: invoiceWizard.projectLabel,
                            draft: "",
                          })
                        }
                      >
                        No
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={wizardBusy}
                        onClick={() =>
                          setInvoiceWizard({
                            step: "fullNumber",
                            rowId: invoiceWizard.rowId,
                            projectLabel: invoiceWizard.projectLabel,
                            draft: "",
                          })
                        }
                      >
                        Yes
                      </button>
                    </div>
                  </>
                ) : null}

                {invoiceWizard.step === "fullNumber" ? (
                  <>
                    <label className="field">
                      <span className="field-label">Invoice number</span>
                      <input
                        ref={invoiceInputRef}
                        className="field-input"
                        value={invoiceWizard.draft}
                        disabled={wizardBusy}
                        placeholder="Enter invoice number"
                        onChange={(event) =>
                          setInvoiceWizard({
                            ...invoiceWizard,
                            draft: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="dialog-actions">
                      <button
                        type="button"
                        className="button secondary"
                        disabled={wizardBusy}
                        onClick={() => setInvoiceWizard(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={
                          wizardBusy || !invoiceWizard.draft.trim()
                        }
                        onClick={() =>
                          void applyFullInvoice(
                            invoiceWizard.rowId,
                            invoiceWizard.draft,
                          )
                        }
                      >
                        {wizardBusy ? "Saving…" : "OK"}
                      </button>
                    </div>
                  </>
                ) : null}

                {invoiceWizard.step === "partialPercent" ? (
                  <>
                    <label className="field">
                      <span className="field-label">Percent invoiced</span>
                      <input
                        ref={invoiceInputRef}
                        className="field-input"
                        type="number"
                        min={1}
                        max={100}
                        value={invoiceWizard.draft}
                        disabled={wizardBusy}
                        placeholder="e.g. 25"
                        onChange={(event) =>
                          setInvoiceWizard({
                            ...invoiceWizard,
                            draft: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="dialog-actions">
                      <button
                        type="button"
                        className="button secondary"
                        disabled={wizardBusy}
                        onClick={() => setInvoiceWizard(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={
                          wizardBusy || !invoiceWizard.draft.trim()
                        }
                        onClick={() =>
                          setInvoiceWizard({
                            step: "partialNumber",
                            rowId: invoiceWizard.rowId,
                            projectLabel: invoiceWizard.projectLabel,
                            percent: invoiceWizard.draft.trim(),
                            draft: "",
                          })
                        }
                      >
                        Next
                      </button>
                    </div>
                  </>
                ) : null}

                {invoiceWizard.step === "partialNumber" ? (
                  <>
                    <p className="dialog-subtitle">
                      Percent invoiced: {invoiceWizard.percent}%
                    </p>
                    <label className="field">
                      <span className="field-label">Invoice number</span>
                      <input
                        ref={invoiceInputRef}
                        className="field-input"
                        value={invoiceWizard.draft}
                        disabled={wizardBusy}
                        placeholder="Enter invoice number"
                        onChange={(event) =>
                          setInvoiceWizard({
                            ...invoiceWizard,
                            draft: event.target.value,
                          })
                        }
                      />
                    </label>
                    <div className="dialog-actions">
                      <button
                        type="button"
                        className="button secondary"
                        disabled={wizardBusy}
                        onClick={() => setInvoiceWizard(null)}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="button primary"
                        disabled={
                          wizardBusy || !invoiceWizard.draft.trim()
                        }
                        onClick={() =>
                          void applyPartialInvoice(
                            invoiceWizard.rowId,
                            invoiceWizard.percent,
                            invoiceWizard.draft,
                          )
                        }
                      >
                        {wizardBusy ? "Saving…" : "OK"}
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
