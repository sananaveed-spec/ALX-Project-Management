"use client";

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from "react";
import { createPortal } from "react-dom";
import { buildFullName, buildUniqueId, getNextPointNo, getUniqueIdConflict, type ProjectEntry } from "@/lib/projects";

export type ExistingProjectSaveValues = {
  projectName: string;
  customer: string;
  awardDate: string;
  year: string;
  no: string;
  uniqueId: string;
  fullName: string;
  /** Optional; written to Projects → Engineer on create. */
  engineer?: string;
  createOnBasecamp?: boolean;
  createOnAts?: boolean;
};

type AtsUser = {
  id: string;
  name: string;
  email: string;
};

type ExistingProjectDialogProps = {
  open: boolean;
  onClose: () => void;
  projects: ProjectEntry[];
  onSave?: (values: ExistingProjectSaveValues) => void | Promise<boolean | void>;
};

type FilledProject = {
  projectName: string;
  customer: string;
  awardDate: string;
  year: string;
  no: string;
};

const emptyFilled: FilledProject = {
  projectName: "",
  customer: "",
  awardDate: "",
  year: "",
  no: "",
};

function matchesKeyword(project: ProjectEntry, keyword: string) {
  const q = keyword.trim().toLowerCase();
  if (!q) {
    return false;
  }

  const uniqueId = project.uniqueId.trim().toLowerCase();
  const projectName = project.projectName.trim().toLowerCase();
  const fullName = project.fullName.trim().toLowerCase();

  return (
    uniqueId.startsWith(q) ||
    projectName.includes(q) ||
    fullName.includes(q)
  );
}

export function ExistingProjectDialog({
  open,
  onClose,
  projects,
  onSave,
}: ExistingProjectDialogProps) {
  const titleId = useId();
  const listId = useId();
  const [mounted, setMounted] = useState(false);
  const [query, setQuery] = useState("");
  const [highlightIndex, setHighlightIndex] = useState(0);
  const [filled, setFilled] = useState<FilledProject>(emptyFilled);
  const [selectedSourceId, setSelectedSourceId] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [uniqueIdError, setUniqueIdError] = useState<string | null>(null);
  const [createOnBasecamp, setCreateOnBasecamp] = useState(false);
  const [basecampConnected, setBasecampConnected] = useState(false);
  const [basecampStatusLoading, setBasecampStatusLoading] = useState(false);
  const [createOnAts, setCreateOnAts] = useState(false);
  const [atsConfigured, setAtsConfigured] = useState(false);
  const [atsStatusLoading, setAtsStatusLoading] = useState(false);
  const [engineer, setEngineer] = useState("");
  const [engineers, setEngineers] = useState<AtsUser[]>([]);
  const [engineersLoading, setEngineersLoading] = useState(false);
  const [engineersError, setEngineersError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const comboboxRef = useRef<HTMLDivElement | null>(null);

  const uniqueId = useMemo(
    () => buildUniqueId(filled.customer, filled.year, filled.no),
    [filled.customer, filled.year, filled.no],
  );

  const fullName = useMemo(
    () => buildFullName(uniqueId, filled.projectName),
    [uniqueId, filled.projectName],
  );

  const uniqueIdConflict = useMemo(() => {
    if (!selectedSourceId) {
      return null;
    }
    return getUniqueIdConflict(uniqueId, projects);
  }, [selectedSourceId, uniqueId, projects]);

  const matches = useMemo(() => {
    const q = query.trim();
    if (!q) {
      return [];
    }

    return projects
      .filter((project) => matchesKeyword(project, q))
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, 50);
  }, [projects, query]);

  const canSave = Boolean(
    selectedSourceId &&
      filled.projectName.trim() &&
      filled.customer.trim() &&
      filled.no.trim() &&
      uniqueId.trim() &&
      !uniqueIdConflict,
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setQuery("");
    setFilled(emptyFilled);
    setSelectedSourceId(null);
    setHighlightIndex(0);
    setShowSuggestions(false);
    setUniqueIdError(null);
    setCreateOnBasecamp(false);
    setCreateOnAts(false);
    setEngineer("");
    setEngineersError(null);
    setSaving(false);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 0);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadBasecampStatus() {
      setBasecampStatusLoading(true);
      try {
        const response = await fetch("/api/basecamp/status");
        const data = (await response.json()) as { connected?: boolean };
        if (!cancelled) {
          setBasecampConnected(Boolean(data.connected));
        }
      } catch {
        if (!cancelled) {
          setBasecampConnected(false);
        }
      } finally {
        if (!cancelled) {
          setBasecampStatusLoading(false);
        }
      }
    }

    void loadBasecampStatus();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadAtsStatus() {
      setAtsStatusLoading(true);
      try {
        const response = await fetch("/api/timesheets/status");
        const data = (await response.json()) as { configured?: boolean };
        if (!cancelled) {
          setAtsConfigured(Boolean(data.configured));
        }
      } catch {
        if (!cancelled) {
          setAtsConfigured(false);
        }
      } finally {
        if (!cancelled) {
          setAtsStatusLoading(false);
        }
      }
    }

    void loadAtsStatus();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadEngineers() {
      setEngineersLoading(true);
      setEngineersError(null);

      async function fetchUsers() {
        const response = await fetch("/api/timesheets/users");
        const data = (await response.json()) as {
          users?: AtsUser[];
          error?: string;
        };
        return { response, data };
      }

      try {
        let { response, data } = await fetchUsers();
        // One retry — Next.js compile / brief ATS blips often recover.
        if (!response.ok) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          ({ response, data } = await fetchUsers());
        }
        if (!cancelled) {
          setEngineers(data.users ?? []);
          setEngineersError(
            response.ok
              ? null
              : data.error || "Could not load ATS engineers.",
          );
        }
      } catch (error) {
        if (!cancelled) {
          setEngineers([]);
          const message =
            error instanceof Error ? error.message : "Could not load ATS engineers.";
          setEngineersError(
            /failed to fetch|fetch failed|networkerror/i.test(message)
              ? "Could not load ATS engineers (network). Close and reopen, or try again."
              : message,
          );
        }
      } finally {
        if (!cancelled) {
          setEngineersLoading(false);
        }
      }
    }

    void loadEngineers();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    setHighlightIndex(0);
  }, [query]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent) {
      if (!comboboxRef.current) {
        return;
      }
      if (!comboboxRef.current.contains(event.target as Node)) {
        setShowSuggestions(false);
      }
    }

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  if (!open || !mounted) {
    return null;
  }

  function fillFromProject(project: ProjectEntry) {
    const nextNo = getNextPointNo(projects, project) ?? project.no;
    setFilled({
      projectName: project.projectName,
      customer: project.customer,
      awardDate: project.awardDate,
      year: project.year,
      no: nextNo,
    });
    setSelectedSourceId(project.id);
    setEngineer(project.engineer?.trim() ?? "");
    setCreateOnBasecamp(project.basecamp?.trim().toLowerCase() === "yes");
    setCreateOnAts(project.ats?.trim().toLowerCase() === "yes");
    setQuery(project.fullName || `${project.uniqueId} - ${project.projectName}`);
    setShowSuggestions(false);
    setUniqueIdError(null);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === "ArrowDown") {
      event.preventDefault();
      if (matches.length === 0) {
        return;
      }
      setShowSuggestions(true);
      setHighlightIndex((current) => (current + 1) % matches.length);
      return;
    }

    if (event.key === "ArrowUp") {
      event.preventDefault();
      if (matches.length === 0) {
        return;
      }
      setShowSuggestions(true);
      setHighlightIndex(
        (current) => (current - 1 + matches.length) % matches.length,
      );
      return;
    }

    if (event.key === "Enter") {
      event.preventDefault();
      const selected = matches[highlightIndex] ?? matches[0];
      if (selected) {
        fillFromProject(selected);
      }
      return;
    }

    if (event.key === "Escape") {
      setShowSuggestions(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canSave || saving) {
      return;
    }

    const conflict = getUniqueIdConflict(uniqueId, projects);
    if (conflict) {
      setUniqueIdError(conflict);
      return;
    }

    setUniqueIdError(null);
    setSaving(true);
    try {
      const result = await onSave?.({
        projectName: filled.projectName,
        customer: filled.customer,
        awardDate: filled.awardDate,
        year: filled.year,
        no: filled.no.trim(),
        uniqueId,
        fullName,
        engineer: engineer.trim() || undefined,
        createOnBasecamp,
        createOnAts,
      });
      if (result === false) {
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div className="dialog-backdrop" role="presentation">
      <div
        className="dialog-panel dialog-panel--wide"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dialog-header">
          <h2 id={titleId} className="dialog-title">
            Existing Project
          </h2>
          <button
            type="button"
            className="dialog-close"
            aria-label="Close"
            onClick={onClose}
          >
            ×
          </button>
        </div>

        <form className="dialog-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Full Name</span>
            <div className="search-combobox" ref={comboboxRef}>
              <input
                ref={inputRef}
                className="field-input"
                type="text"
                value={query}
                placeholder="Search by Unique ID or project name (e.g. ESR26)"
                onChange={(event) => {
                  setQuery(event.target.value);
                  setFilled(emptyFilled);
                  setSelectedSourceId(null);
                  setEngineer("");
                  setCreateOnBasecamp(false);
                  setCreateOnAts(false);
                  setShowSuggestions(true);
                }}
                onFocus={() => {
                  if (query.trim()) {
                    setShowSuggestions(true);
                  }
                }}
                onKeyDown={handleKeyDown}
                role="combobox"
                aria-expanded={showSuggestions && matches.length > 0}
                aria-controls={listId}
                aria-autocomplete="list"
                autoComplete="off"
              />

              {showSuggestions && query.trim() ? (
                <div id={listId} className="search-suggestions" role="listbox">
                  {matches.length === 0 ? (
                    <p className="search-empty">No matching projects.</p>
                  ) : (
                    matches.map((project, index) => (
                      <button
                        key={project.id}
                        type="button"
                        role="option"
                        aria-selected={index === highlightIndex}
                        className={
                          index === highlightIndex
                            ? "search-option active"
                            : "search-option"
                        }
                        onMouseEnter={() => setHighlightIndex(index)}
                        onClick={() => fillFromProject(project)}
                      >
                        <span className="search-option-title">
                          {project.fullName || project.projectName}
                        </span>
                        <span className="search-option-meta">
                          {project.uniqueId}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <p className="field-hint">
                  Pick an existing project, then edit No (e.g. 217.1) and Save
                  to create a new version row.
                </p>
              )}
            </div>
          </label>

          <label className="field">
            <span className="field-label">Project Name</span>
            <input
              className="field-input field-input--readonly"
              type="text"
              value={filled.projectName}
              readOnly
              tabIndex={-1}
            />
          </label>

          <label className="field">
            <span className="field-label">Customer</span>
            <input
              className="field-input field-input--readonly"
              type="text"
              value={filled.customer}
              readOnly
              tabIndex={-1}
            />
          </label>

          <label className="field">
            <span className="field-label">Award Date</span>
            <input
              className="field-input field-date"
              type="date"
              name="awardDate"
              value={filled.awardDate}
              disabled={!selectedSourceId}
              onChange={(event) => {
                const dateValue = event.target.value;
                setFilled((current) => ({
                  ...current,
                  awardDate: dateValue,
                  year: dateValue
                    ? dateValue.slice(2, 4) || current.year
                    : current.year,
                }));
              }}
            />
          </label>

          <label className="field">
            <span className="field-label">Year</span>
            <input
              className="field-input field-input--readonly"
              type="text"
              value={filled.year}
              readOnly
              tabIndex={-1}
            />
          </label>

          <label className="field">
            <span className="field-label">No</span>
            <input
              className="field-input"
              type="text"
              name="no"
              value={filled.no}
              onChange={(event) => {
                setFilled((current) => ({
                  ...current,
                  no: event.target.value,
                }));
                setUniqueIdError(null);
              }}
              disabled={!selectedSourceId}
              required={Boolean(selectedSourceId)}
              placeholder={selectedSourceId ? "e.g. 217.1" : ""}
            />
            {selectedSourceId ? (
              <span className="field-hint">
                Auto-filled next point version (001 → 001.1 → 001.2). You can
                edit No; UniqueID updates automatically.
              </span>
            ) : null}
          </label>

          <label className="field">
            <span className="field-label">UniqueID</span>
            <input
              className="field-input field-input--readonly"
              type="text"
              value={selectedSourceId ? uniqueId : ""}
              readOnly
              tabIndex={-1}
            />
            {uniqueIdError || uniqueIdConflict ? (
              <span className="field-hint error" role="alert">
                {uniqueIdError || uniqueIdConflict}
              </span>
            ) : null}
          </label>

          <label className="field">
            <span className="field-label">Full Name (new)</span>
            <input
              className="field-input field-input--readonly"
              type="text"
              value={selectedSourceId ? fullName : ""}
              readOnly
              tabIndex={-1}
            />
          </label>

          <label className="field">
            <span className="field-label">Engineer (optional)</span>
            <select
              className="field-input field-select"
              name="engineer"
              value={engineer}
              disabled={!selectedSourceId || engineersLoading}
              onChange={(event) => setEngineer(event.target.value)}
            >
              <option value="">
                {engineersLoading
                  ? "Loading ATS users…"
                  : "Select engineer (optional)"}
              </option>
              {engineer.trim() &&
              !engineers.some((user) => user.name === engineer.trim()) ? (
                <option value={engineer.trim()}>{engineer.trim()}</option>
              ) : null}
              {engineers.map((user) => (
                <option key={user.id} value={user.name}>
                  {user.name}
                </option>
              ))}
            </select>
            {engineersError ? (
              <span className="field-hint error">{engineersError}</span>
            ) : (
              <span className="field-hint">
                Active users from ATS / Timesheets. Sets Projects → Engineer
                when saved.
              </span>
            )}
          </label>

          <div className="field">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={createOnBasecamp}
                onChange={(event) => setCreateOnBasecamp(event.target.checked)}
                disabled={!selectedSourceId}
              />
              <span>Create on Basecamp?</span>
            </label>
            {createOnBasecamp ? (
              basecampStatusLoading ? (
                <span className="field-hint">Checking Basecamp connection…</span>
              ) : basecampConnected ? (
                <span className="field-hint">
                  Connected. Creates a Basecamp project named with the Full Name
                  and files it into the TestBySana folder.
                </span>
              ) : (
                <span className="field-hint">
                  Basecamp is not connected.{" "}
                  <a className="inline-link" href="/api/basecamp/auth">
                    Connect Basecamp
                  </a>{" "}
                  first, then save again.
                </span>
              )
            ) : null}
          </div>

          <div className="field">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={createOnAts}
                onChange={(event) => setCreateOnAts(event.target.checked)}
                disabled={!selectedSourceId}
              />
              <span>Create on ATS?</span>
            </label>
            {createOnAts ? (
              atsStatusLoading ? (
                <span className="field-hint">Checking ATS connection…</span>
              ) : atsConfigured ? (
                <span className="field-hint">
                  Configured. Creates a Timesheets project named with the Full
                  Name.
                </span>
              ) : (
                <span className="field-hint">
                  ATS / Timesheets is not configured. Set TIMESHEETS_API_TOKEN
                  and TIMESHEETS_ORGANIZATION_ID in .env.local.
                </span>
              )
            ) : null}
          </div>

          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={!canSave || saving}
            >
              {saving ? "Saving…" : "Save as New"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
