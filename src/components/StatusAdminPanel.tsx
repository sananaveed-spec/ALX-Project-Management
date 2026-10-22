"use client";

import { useEffect, useId, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  AC_COURT_ALX,
  AC_COURT_CLIENT,
  createStatusChild,
  createStatusGroup,
  createStatusLeaf,
  type StatusCourt,
  type StatusMenuChild,
  type StatusMenuEntry,
  type StatusMenuGroup,
  type StatusMenuLeaf,
} from "@/lib/project-status-menu";

type EditorState =
  | {
      mode: "add-group" | "edit-group";
      entryId?: string;
      label: string;
    }
  | {
      mode: "add-leaf" | "edit-leaf";
      entryId?: string;
      value: string;
      court: StatusCourt;
    }
  | {
      mode: "add-child" | "edit-child";
      groupId: string;
      childId?: string;
      value: string;
      court: StatusCourt;
    };

const COURT_OPTIONS: { value: StatusCourt; label: string }[] = [
  { value: AC_COURT_ALX, label: "ALX Court" },
  { value: AC_COURT_CLIENT, label: "Client Court" },
  { value: "choose", label: "Ask user (Terminated)" },
];

async function persistStatusMenu(statusMenu: StatusMenuEntry[]) {
  const response = await fetch("/api/status-menu", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ statusMenu }),
  });
  const data = (await response.json()) as {
    error?: string;
    statusMenu?: StatusMenuEntry[];
  };
  if (!response.ok) {
    throw new Error(data.error || "Failed to save status menu.");
  }
  return data.statusMenu ?? statusMenu;
}

export function StatusAdminPanel() {
  const [entries, setEntries] = useState<StatusMenuEntry[]>([]);
  const [ready, setReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [expandedGroups, setExpandedGroups] = useState<string[]>([]);
  const [mounted, setMounted] = useState(false);
  const editorTitleId = useId();

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const response = await fetch("/api/status-menu", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Could not load status menu.");
        }
        const data = (await response.json()) as {
          statusMenu?: StatusMenuEntry[];
        };
        if (!cancelled) {
          setEntries(data.statusMenu ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load status menu.",
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

  const groupCount = useMemo(
    () => entries.filter((entry) => entry.type === "group").length,
    [entries],
  );
  const leafCount = useMemo(
    () => entries.filter((entry) => entry.type === "leaf").length,
    [entries],
  );

  async function saveEntries(next: StatusMenuEntry[]) {
    setSaving(true);
    setError(null);
    try {
      const saved = await persistStatusMenu(next);
      setEntries(saved);
      setEditor(null);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save status menu.",
      );
    } finally {
      setSaving(false);
    }
  }

  function toggleGroup(id: string) {
    setExpandedGroups((current) =>
      current.includes(id)
        ? current.filter((item) => item !== id)
        : [...current, id],
    );
  }

  function submitEditor() {
    if (!editor) {
      return;
    }

    if (editor.mode === "add-group" || editor.mode === "edit-group") {
      const label = editor.label.trim();
      if (!label) {
        setError("Parent label is required.");
        return;
      }
      if (editor.mode === "add-group") {
        const group = createStatusGroup(label);
        void saveEntries([...entries, group]);
        setExpandedGroups((current) => [...current, group.id]);
        return;
      }
      void saveEntries(
        entries.map((entry) =>
          entry.id === editor.entryId && entry.type === "group"
            ? { ...entry, label }
            : entry,
        ),
      );
      return;
    }

    if (editor.mode === "add-leaf" || editor.mode === "edit-leaf") {
      const value = editor.value.trim();
      if (!value) {
        setError("Status value is required.");
        return;
      }
      if (editor.mode === "add-leaf") {
        void saveEntries([...entries, createStatusLeaf(value, editor.court)]);
        return;
      }
      void saveEntries(
        entries.map((entry) =>
          entry.id === editor.entryId && entry.type === "leaf"
            ? { ...entry, value, court: editor.court }
            : entry,
        ),
      );
      return;
    }

    if (editor.mode === "add-child" || editor.mode === "edit-child") {
      const value = editor.value.trim();
      if (!value) {
        setError("Sub-item value is required.");
        return;
      }
      if (editor.mode === "add-child") {
        const child = createStatusChild(value, editor.court);
        void saveEntries(
          entries.map((entry) => {
            if (entry.id !== editor.groupId || entry.type !== "group") {
              return entry;
            }
            return { ...entry, children: [...entry.children, child] };
          }),
        );
        setExpandedGroups((current) =>
          current.includes(editor.groupId)
            ? current
            : [...current, editor.groupId],
        );
        return;
      }

      void saveEntries(
        entries.map((entry) => {
          if (entry.id !== editor.groupId || entry.type !== "group") {
            return entry;
          }
          return {
            ...entry,
            children: entry.children.map((child) =>
              child.id === editor.childId
                ? { ...child, value, court: editor.court }
                : child,
            ),
          };
        }),
      );
    }
  }

  function deleteEntry(entry: StatusMenuEntry) {
    const label = entry.type === "group" ? entry.label : entry.value;
    if (
      !window.confirm(
        `Delete "${label}"${entry.type === "group" ? " and all of its sub-items" : ""}?`,
      )
    ) {
      return;
    }
    void saveEntries(entries.filter((item) => item.id !== entry.id));
  }

  function deleteChild(group: StatusMenuGroup, child: StatusMenuChild) {
    if (!window.confirm(`Delete sub-item "${child.value}"?`)) {
      return;
    }
    void saveEntries(
      entries.map((entry) => {
        if (entry.id !== group.id || entry.type !== "group") {
          return entry;
        }
        return {
          ...entry,
          children: entry.children.filter((item) => item.id !== child.id),
        };
      }),
    );
  }

  return (
    <section className="content-panel content-panel--actions content-panel--status-admin">
      <div className="action-row naming-action-row">
        <p className="dialog-subtitle status-admin-summary" style={{ margin: 0 }}>
          {ready
            ? `${groupCount} parent group${groupCount === 1 ? "" : "s"}, ${leafCount} direct status${leafCount === 1 ? "" : "es"}`
            : "Loading…"}
        </p>
        <div className="naming-action-right">
          <button
            type="button"
            className="action-button"
            disabled={!ready || saving}
            onClick={() =>
              setEditor({ mode: "add-group", label: "" })
            }
          >
            Add Parent
          </button>
          <button
            type="button"
            className="action-button"
            disabled={!ready || saving}
            onClick={() =>
              setEditor({
                mode: "add-leaf",
                value: "",
                court: AC_COURT_ALX,
              })
            }
          >
            Add direct status
          </button>
        </div>
      </div>

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading status menu…</p>
      ) : entries.length === 0 ? (
        <p className="table-empty">No status items yet.</p>
      ) : (
        <div className="status-admin-list">
          {entries.map((entry) =>
            entry.type === "group" ? (
              <StatusGroupCard
                key={entry.id}
                group={entry}
                expanded={expandedGroups.includes(entry.id)}
                disabled={saving}
                onToggle={() => toggleGroup(entry.id)}
                onEdit={() =>
                  setEditor({
                    mode: "edit-group",
                    entryId: entry.id,
                    label: entry.label,
                  })
                }
                onDelete={() => deleteEntry(entry)}
                onAddChild={() =>
                  setEditor({
                    mode: "add-child",
                    groupId: entry.id,
                    value: "",
                    court: AC_COURT_ALX,
                  })
                }
                onEditChild={(child) =>
                  setEditor({
                    mode: "edit-child",
                    groupId: entry.id,
                    childId: child.id,
                    value: child.value,
                    court: child.court,
                  })
                }
                onDeleteChild={(child) => deleteChild(entry, child)}
              />
            ) : (
              <StatusLeafCard
                key={entry.id}
                leaf={entry}
                disabled={saving}
                onEdit={() =>
                  setEditor({
                    mode: "edit-leaf",
                    entryId: entry.id,
                    value: entry.value,
                    court: entry.court,
                  })
                }
                onDelete={() => deleteEntry(entry)}
              />
            ),
          )}
        </div>
      )}

      {mounted && editor
        ? createPortal(
            <div
              className="dialog-backdrop"
              role="presentation"
              onClick={(event) => {
                if (event.target === event.currentTarget && !saving) {
                  setEditor(null);
                }
              }}
            >
              <div
                className="dialog-panel status-admin-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby={editorTitleId}
              >
                <div className="dialog-header">
                  <div>
                    <h2 id={editorTitleId} className="dialog-title">
                      {editorTitle(editor)}
                    </h2>
                    <p className="dialog-subtitle">
                      {editorSubtitle(editor)}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="dialog-close"
                    aria-label="Close"
                    disabled={saving}
                    onClick={() => setEditor(null)}
                  >
                    ×
                  </button>
                </div>

                <div className="dialog-form">
                  {editor.mode === "add-group" ||
                  editor.mode === "edit-group" ? (
                    <label className="field">
                      <span className="field-label">Parent Label</span>
                      <input
                        className="field-input"
                        value={editor.label}
                        onChange={(event) =>
                          setEditor({ ...editor, label: event.target.value })
                        }
                        placeholder="e.g. RFI 1-6"
                        autoFocus
                      />
                    </label>
                  ) : editor.mode === "add-leaf" ||
                    editor.mode === "edit-leaf" ||
                    editor.mode === "add-child" ||
                    editor.mode === "edit-child" ? (
                    <>
                      <label className="field">
                        <span className="field-label">
                          {editor.mode === "add-child" ||
                          editor.mode === "edit-child"
                            ? "Sub-item Value"
                            : "Status Value"}
                        </span>
                        <input
                          className="field-input"
                          value={editor.value}
                          onChange={(event) =>
                            setEditor({ ...editor, value: event.target.value })
                          }
                          placeholder="e.g. PIN 70"
                          autoFocus
                        />
                      </label>
                      <label className="field">
                        <span className="field-label">A/C Court</span>
                        <select
                          className="field-input field-select"
                          value={editor.court}
                          onChange={(event) =>
                            setEditor({
                              ...editor,
                              court: event.target.value as StatusCourt,
                            })
                          }
                        >
                          {COURT_OPTIONS.map((option) => (
                            <option key={option.value} value={option.value}>
                              {option.label}
                            </option>
                          ))}
                        </select>
                      </label>
                    </>
                  ) : null}

                  <div className="dialog-actions">
                    <button
                      type="button"
                      className="button secondary"
                      disabled={saving}
                      onClick={() => setEditor(null)}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="button primary"
                      disabled={saving}
                      onClick={() => submitEditor()}
                    >
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </section>
  );
}

function editorTitle(editor: EditorState) {
  switch (editor.mode) {
    case "add-group":
      return "Add Parent";
    case "edit-group":
      return "Edit Parent";
    case "add-leaf":
      return "Add Direct Status";
    case "edit-leaf":
      return "Edit Direct Status";
    case "add-child":
      return "Add Sub-item";
    case "edit-child":
      return "Edit Sub-item";
  }
}

function editorSubtitle(editor: EditorState) {
  switch (editor.mode) {
    case "add-group":
    case "edit-group":
      return "Parents group related statuses. They are not selectable themselves.";
    case "add-leaf":
    case "edit-leaf":
      return "A standalone status shown in Active Projects (not under a parent).";
    case "add-child":
    case "edit-child":
      return "A selectable status nested under its parent group.";
  }
}

function courtLabel(court: StatusCourt) {
  if (court === "choose") {
    return "Ask user";
  }
  return court;
}

function StatusGroupCard({
  group,
  expanded,
  disabled,
  onToggle,
  onEdit,
  onDelete,
  onAddChild,
  onEditChild,
  onDeleteChild,
}: {
  group: StatusMenuGroup;
  expanded: boolean;
  disabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddChild: () => void;
  onEditChild: (child: StatusMenuChild) => void;
  onDeleteChild: (child: StatusMenuChild) => void;
}) {
  return (
    <article className="status-admin-card">
      <div className="status-admin-card-header">
        <button
          type="button"
          className="status-admin-expand"
          onClick={onToggle}
          aria-expanded={expanded}
        >
          <span aria-hidden>{expanded ? "▾" : "▸"}</span>
          <strong>{group.label}</strong>
          <span className="status-admin-meta">
            {group.children.length} sub-item
            {group.children.length === 1 ? "" : "s"}
          </span>
        </button>
        <div className="status-admin-actions">
          <button
            type="button"
            className="button secondary"
            disabled={disabled}
            onClick={onAddChild}
          >
            Add Sub-item
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={disabled}
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={disabled}
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
      {expanded ? (
        <div className="status-admin-children">
          {group.children.length === 0 ? (
            <p className="table-empty">No sub-items yet.</p>
          ) : (
            group.children.map((child) => (
              <div key={child.id} className="status-admin-child-row">
                <div>
                  <div className="status-admin-child-value">{child.value}</div>
                  <div className="status-admin-meta">
                    {courtLabel(child.court)}
                  </div>
                </div>
                <div className="status-admin-actions">
                  <button
                    type="button"
                    className="button secondary"
                    disabled={disabled}
                    onClick={() => onEditChild(child)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="button secondary"
                    disabled={disabled}
                    onClick={() => onDeleteChild(child)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      ) : null}
    </article>
  );
}

function StatusLeafCard({
  leaf,
  disabled,
  onEdit,
  onDelete,
}: {
  leaf: StatusMenuLeaf;
  disabled: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <article className="status-admin-card status-admin-card--leaf">
      <div className="status-admin-card-header">
        <div>
          <strong>{leaf.value}</strong>
          <div className="status-admin-meta">{courtLabel(leaf.court)}</div>
        </div>
        <div className="status-admin-actions">
          <button
            type="button"
            className="button secondary"
            disabled={disabled}
            onClick={onEdit}
          >
            Edit
          </button>
          <button
            type="button"
            className="button secondary"
            disabled={disabled}
            onClick={onDelete}
          >
            Delete
          </button>
        </div>
      </div>
    </article>
  );
}
