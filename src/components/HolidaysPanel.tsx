"use client";

import { useEffect, useState } from "react";
import {
  createHoliday,
  formatHolidayDate,
  getHolidayDayName,
  type Holiday,
} from "@/lib/holidays";

async function persistHolidays(next: Holiday[]) {
  const response = await fetch("/api/holidays", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ holidays: next }),
  });
  const data = (await response.json()) as {
    error?: string;
    holidays?: Holiday[];
  };
  if (!response.ok) {
    throw new Error(data.error || "Failed to save holidays.");
  }
  return data.holidays ?? next;
}

export function HolidaysPanel() {
  const [holidays, setHolidays] = useState<Holiday[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ name: string; date: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/holidays", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Could not load holidays.");
        }
        const data = (await response.json()) as { holidays?: Holiday[] };
        if (!cancelled) {
          setHolidays(data.holidays ?? []);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load holidays.",
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

  async function saveList(next: Holiday[]) {
    setSaving(true);
    setError(null);
    try {
      const saved = await persistHolidays(next);
      setHolidays(saved);
      return saved;
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Failed to save holidays.",
      );
      throw saveError;
    } finally {
      setSaving(false);
    }
  }

  function handleAdd() {
    if (editingId || saving) {
      return;
    }
    const holiday = createHoliday();
    setHolidays((current) => [...current, holiday]);
    setEditingId(holiday.id);
    setDraft({ name: holiday.name, date: holiday.date });
  }

  async function handleDelete(holiday: Holiday) {
    if (saving) {
      return;
    }
    const label = holiday.name.trim() || "this holiday";
    if (!window.confirm(`Delete "${label}"?`)) {
      return;
    }

    if (editingId === holiday.id) {
      setEditingId(null);
      setDraft(null);
    }

    try {
      await saveList(holidays.filter((item) => item.id !== holiday.id));
    } catch {
      /* error already set */
    }
  }

  async function handleMove(id: string, direction: -1 | 1) {
    if (editingId || saving) {
      return;
    }

    const index = holidays.findIndex((holiday) => holiday.id === id);
    if (index < 0) {
      return;
    }

    const target = index + direction;
    if (target < 0 || target >= holidays.length) {
      return;
    }

    const next = [...holidays];
    const [item] = next.splice(index, 1);
    next.splice(target, 0, item!);
    try {
      await saveList(next);
    } catch {
      /* error already set */
    }
  }

  function startEditing(holiday: Holiday) {
    if (saving) {
      return;
    }
    setEditingId(holiday.id);
    setDraft({ name: holiday.name, date: holiday.date });
  }

  function cancelEditing() {
    if (!editingId) {
      return;
    }

    const current = holidays.find((holiday) => holiday.id === editingId);
    if (current && !current.name.trim() && !current.date) {
      setHolidays((list) => list.filter((holiday) => holiday.id !== editingId));
    }

    setEditingId(null);
    setDraft(null);
  }

  async function saveEditing() {
    if (!editingId || !draft || saving) {
      return;
    }

    const next = holidays.map((holiday) =>
      holiday.id === editingId
        ? {
            ...holiday,
            name: draft.name.trim(),
            date: draft.date,
          }
        : holiday,
    );

    try {
      await saveList(next);
      setEditingId(null);
      setDraft(null);
    } catch {
      /* error already set */
    }
  }

  return (
    <section className="content-panel content-panel--actions holidays-panel">
      <div className="holidays-header">
        <div>
          <h2 className="holidays-title">Holidays</h2>
          <p className="holidays-subtitle">
            Add company holidays with a name and date (same list as Utilization
            Dashboard). These dates also skip To-Do Email Scheduling digests.
          </p>
        </div>
        <button
          type="button"
          className="button primary"
          onClick={handleAdd}
          disabled={!ready || Boolean(editingId) || saving}
        >
          + Add holiday
        </button>
      </div>

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}

      {!ready ? (
        <p className="table-empty">Loading holidays…</p>
      ) : (
        <div className="holidays-table-wrap">
          <table className="holidays-table">
            <thead>
              <tr>
                <th scope="col">Name</th>
                <th scope="col">Date</th>
                <th scope="col">Day</th>
                <th scope="col" className="holidays-actions-col">
                  Action
                </th>
              </tr>
            </thead>
            <tbody>
              {holidays.length === 0 ? (
                <tr>
                  <td colSpan={4} className="holidays-empty">
                    No holidays yet. Click “+ Add holiday” to create one (for
                    example Independence Day on 14-08-2026).
                  </td>
                </tr>
              ) : (
                holidays.map((holiday, index) => {
                  const isEditing = editingId === holiday.id;
                  const nameValue = isEditing
                    ? (draft?.name ?? holiday.name)
                    : holiday.name;
                  const dateValue = isEditing
                    ? (draft?.date ?? holiday.date)
                    : holiday.date;
                  const dayName = getHolidayDayName(dateValue);

                  return (
                    <tr key={holiday.id}>
                      <td>
                        {isEditing ? (
                          <input
                            type="text"
                            className="field-input holidays-input"
                            value={nameValue}
                            placeholder="Event Name"
                            aria-label="Holiday name"
                            disabled={saving}
                            onChange={(event) =>
                              setDraft((current) => ({
                                name: event.target.value,
                                date: current?.date ?? holiday.date,
                              }))
                            }
                          />
                        ) : (
                          <span className="holidays-value">
                            {holiday.name.trim() || "—"}
                          </span>
                        )}
                      </td>
                      <td>
                        {isEditing ? (
                          <input
                            type="date"
                            className="field-input holidays-input holidays-date"
                            value={dateValue}
                            aria-label="Holiday date"
                            disabled={saving}
                            onChange={(event) =>
                              setDraft((current) => ({
                                name: current?.name ?? holiday.name,
                                date: event.target.value,
                              }))
                            }
                          />
                        ) : (
                          <span className="holidays-value">
                            {holiday.date
                              ? formatHolidayDate(holiday.date)
                              : "—"}
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="holidays-value">
                          {dayName || "—"}
                        </span>
                      </td>
                      <td className="holidays-actions-col">
                        <div className="holidays-row-actions">
                          <button
                            type="button"
                            className="button secondary button-small"
                            onClick={() => void handleMove(holiday.id, -1)}
                            disabled={
                              saving || Boolean(editingId) || index === 0
                            }
                            title="Move up"
                            aria-label="Move holiday up"
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            className="button secondary button-small"
                            onClick={() => void handleMove(holiday.id, 1)}
                            disabled={
                              saving ||
                              Boolean(editingId) ||
                              index === holidays.length - 1
                            }
                            title="Move down"
                            aria-label="Move holiday down"
                          >
                            ↓
                          </button>
                          {isEditing ? (
                            <>
                              <button
                                type="button"
                                className="button primary button-small"
                                onClick={() => void saveEditing()}
                                disabled={saving}
                                aria-label="Save"
                                title="Save"
                              >
                                Save
                              </button>
                              <button
                                type="button"
                                className="button secondary button-small"
                                onClick={cancelEditing}
                                disabled={saving}
                                aria-label="Cancel"
                                title="Cancel"
                              >
                                Cancel
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                className="button secondary button-small"
                                onClick={() => startEditing(holiday)}
                                disabled={saving || Boolean(editingId)}
                                aria-label="Edit"
                                title="Edit"
                              >
                                Edit
                              </button>
                              <button
                                type="button"
                                className="button danger button-small"
                                onClick={() => void handleDelete(holiday)}
                                disabled={
                                  saving ||
                                  (Boolean(editingId) &&
                                    editingId !== holiday.id)
                                }
                                aria-label="Delete"
                                title="Delete"
                              >
                                Delete
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
