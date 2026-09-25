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
import type { CustomerEntry } from "@/lib/customers";
import {
  buildFullName,
  buildUniqueId,
  getMaxUsedNoForCustomerYear,
  getUniqueIdConflict,
  type ProjectEntry,
} from "@/lib/projects";

export type NewProjectFormValues = {
  projectName: string;
  customer: string;
  awardDate: string;
  year: string;
  no: string;
  uniqueId: string;
  fullName: string;
  /** Optional; written to Projects → Engineer on create. */
  engineer?: string;
  /** Optional; PM name from active ATS users. */
  pmName?: string;
  createOnBasecamp?: boolean;
  createOnAts?: boolean;
  /** QB checkbox → Yes / No on Project Naming. */
  qb?: boolean;
};

type AtsUser = {
  id: string;
  name: string;
  email: string;
};

type ProjectFormFields = Omit<
  NewProjectFormValues,
  | "uniqueId"
  | "fullName"
  | "createOnBasecamp"
  | "createOnAts"
  | "engineer"
  | "pmName"
  | "qb"
> & {
  engineer: string;
  pmName: string;
};

type NewProjectDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit?: (values: NewProjectFormValues) => void | Promise<boolean | void>;
  mode?: "create" | "edit";
  initialValues?: ProjectFormFields | null;
  /** Seed Create on Basecamp checkbox (Edit). */
  initialCreateOnBasecamp?: boolean;
  /** Seed Create on ATS checkbox (Edit). */
  initialCreateOnAts?: boolean;
  /** Seed QB checkbox (Edit). */
  initialQb?: boolean;
  existingProjects?: ProjectEntry[];
  excludeProjectId?: string | null;
};

const emptyForm: ProjectFormFields = {
  projectName: "",
  customer: "",
  awardDate: "",
  year: "",
  no: "",
  engineer: "",
  pmName: "",
};

function customerLabel(customer: CustomerEntry) {
  const code = customer.customerId.trim();
  const name = customer.customerName.trim();
  if (code && name) {
    return `${code} — ${name}`;
  }
  return code || name || "—";
}

function matchesCustomer(customer: CustomerEntry, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) {
    return true;
  }
  return (
    customer.customerId.toLowerCase().includes(q) ||
    customer.customerName.toLowerCase().includes(q)
  );
}

export function NewProjectDialog({
  open,
  onClose,
  onSubmit,
  mode = "create",
  initialValues = null,
  initialCreateOnBasecamp = false,
  initialCreateOnAts = false,
  initialQb = false,
  existingProjects = [],
  excludeProjectId = null,
}: NewProjectDialogProps) {
  const titleId = useId();
  const customerListId = useId();
  const [values, setValues] = useState<ProjectFormFields>(emptyForm);
  const [mounted, setMounted] = useState(false);
  const [customers, setCustomers] = useState<CustomerEntry[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [customerQuery, setCustomerQuery] = useState("");
  const [showCustomerSuggestions, setShowCustomerSuggestions] = useState(false);
  const [customerHighlight, setCustomerHighlight] = useState(0);
  const customerComboboxRef = useRef<HTMLDivElement | null>(null);
  const [uniqueIdError, setUniqueIdError] = useState<string | null>(null);
  const [createOnBasecamp, setCreateOnBasecamp] = useState(false);
  const [basecampConnected, setBasecampConnected] = useState(false);
  const [basecampStatusLoading, setBasecampStatusLoading] = useState(false);
  const [createOnAts, setCreateOnAts] = useState(false);
  const [qb, setQb] = useState(false);
  const [atsConfigured, setAtsConfigured] = useState(false);
  const [atsStatusLoading, setAtsStatusLoading] = useState(false);
  const [engineers, setEngineers] = useState<AtsUser[]>([]);
  const [engineersLoading, setEngineersLoading] = useState(false);
  const [engineersError, setEngineersError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const uniqueId = useMemo(
    () => buildUniqueId(values.customer, values.year, values.no),
    [values.customer, values.year, values.no],
  );

  const fullName = useMemo(
    () => buildFullName(uniqueId, values.projectName),
    [uniqueId, values.projectName],
  );

  const uniqueIdConflict = useMemo(
    () => getUniqueIdConflict(uniqueId, existingProjects, excludeProjectId),
    [uniqueId, existingProjects, excludeProjectId],
  );

  const noSuggestion = useMemo(
    () =>
      getMaxUsedNoForCustomerYear(
        existingProjects,
        values.customer,
        values.year,
        excludeProjectId,
      ),
    [existingProjects, values.customer, values.year, excludeProjectId],
  );

  const selectedCustomer = useMemo(
    () =>
      customers.find(
        (customer) =>
          customer.customerId.trim().toLowerCase() ===
          values.customer.trim().toLowerCase(),
      ) ?? null,
    [customers, values.customer],
  );

  const customerMatches = useMemo(() => {
    return customers
      .filter((customer) => matchesCustomer(customer, customerQuery))
      .sort((a, b) =>
        a.customerId.localeCompare(b.customerId, undefined, {
          sensitivity: "base",
        }),
      )
      .slice(0, 80);
  }, [customers, customerQuery]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setValues(
      initialValues
        ? { ...emptyForm, ...initialValues, engineer: initialValues.engineer ?? "", pmName: initialValues.pmName ?? "" }
        : emptyForm,
    );
    setUniqueIdError(null);
    setCreateOnBasecamp(initialCreateOnBasecamp);
    setCreateOnAts(initialCreateOnAts);
    setQb(initialQb);
    setEngineersError(null);
    setSaving(false);
    setShowCustomerSuggestions(false);
    setCustomerHighlight(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open-gated seed
  }, [
    open,
    mode,
    initialValues?.projectName,
    initialValues?.customer,
    initialValues?.awardDate,
    initialValues?.year,
    initialValues?.no,
    initialValues?.engineer,
    initialValues?.pmName,
    initialCreateOnBasecamp,
    initialCreateOnAts,
    initialQb,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }
    if (selectedCustomer) {
      setCustomerQuery(customerLabel(selectedCustomer));
      return;
    }
    setCustomerQuery(values.customer);
  }, [open, selectedCustomer, values.customer]);

  useEffect(() => {
    setUniqueIdError(null);
  }, [uniqueId]);

  // When Customer + Year are set on New Project, suggest next No after max used.
  useEffect(() => {
    if (!open || mode !== "create") {
      return;
    }
    if (!values.customer.trim() || values.year.trim().length < 2) {
      return;
    }
    const suggestion = getMaxUsedNoForCustomerYear(
      existingProjects,
      values.customer,
      values.year,
      excludeProjectId,
    );
    setValues((current) => {
      if (suggestion) {
        if (current.no.trim() === suggestion.suggestedNext) {
          return current;
        }
        const currentNo = current.no.trim();
        const paddedMax = String(suggestion.maxNo).padStart(3, "0");
        // Fill suggested next when empty or still on a used max No (incl. point).
        if (
          !currentNo ||
          currentNo === suggestion.maxNoLabel ||
          currentNo === String(suggestion.maxNo) ||
          currentNo === paddedMax
        ) {
          return { ...current, no: suggestion.suggestedNext };
        }
        return current;
      }
      // No existing IDs for this Customer+Year — start at 001 if empty.
      if (!current.no.trim()) {
        return { ...current, no: "001" };
      }
      return current;
    });
  }, [
    open,
    mode,
    values.customer,
    values.year,
    existingProjects,
    excludeProjectId,
  ]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadCustomers() {
      setCustomersLoading(true);
      setCustomersError(null);
      try {
        const response = await fetch("/api/customers");
        if (!response.ok) {
          throw new Error("Could not load customers.");
        }
        const data = (await response.json()) as {
          customers?: CustomerEntry[];
        };
        if (!cancelled) {
          setCustomers(data.customers ?? []);
        }
      } catch (loadError) {
        if (!cancelled) {
          setCustomers([]);
          setCustomersError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load customers.",
          );
        }
      } finally {
        if (!cancelled) {
          setCustomersLoading(false);
        }
      }
    }

    void loadCustomers();
    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!showCustomerSuggestions) {
      return;
    }
    function handlePointerDown(event: MouseEvent) {
      if (!customerComboboxRef.current) {
        return;
      }
      if (!customerComboboxRef.current.contains(event.target as Node)) {
        setShowCustomerSuggestions(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [showCustomerSuggestions]);

  useEffect(() => {
    setCustomerHighlight(0);
  }, [customerQuery, showCustomerSuggestions]);

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

  // Active ATS / Timesheets users for optional Engineer.
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
            error instanceof Error
              ? error.message
              : "Could not load ATS engineers.";
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

  const basecampLocked = mode === "edit" && initialCreateOnBasecamp;
  const atsLocked = mode === "edit" && initialCreateOnAts;

  if (!open || !mounted) {
    return null;
  }

  function updateField<K extends keyof ProjectFormFields>(
    field: K,
    value: ProjectFormFields[K],
  ) {
    setValues((current) => ({ ...current, [field]: value }));
  }

  function handleAwardDateChange(dateValue: string) {
    updateField("awardDate", dateValue);
    if (dateValue) {
      const year = dateValue.slice(2, 4);
      if (year) {
        updateField("year", year);
      }
    }
  }

  function pickCustomer(customer: CustomerEntry) {
    updateField("customer", customer.customerId.trim());
    setCustomerQuery(customerLabel(customer));
    setShowCustomerSuggestions(false);
  }

  function handleCustomerKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (!showCustomerSuggestions && event.key === "ArrowDown") {
      setShowCustomerSuggestions(true);
      return;
    }
    if (!showCustomerSuggestions || customerMatches.length === 0) {
      return;
    }
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setCustomerHighlight((current) =>
        Math.min(current + 1, customerMatches.length - 1),
      );
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setCustomerHighlight((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter") {
      event.preventDefault();
      const choice = customerMatches[customerHighlight];
      if (choice) {
        pickCustomer(choice);
      }
    } else if (event.key === "Escape") {
      setShowCustomerSuggestions(false);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const conflict = getUniqueIdConflict(
      uniqueId,
      existingProjects,
      excludeProjectId,
    );
    if (conflict) {
      setUniqueIdError(conflict);
      return;
    }
    if (!values.projectName.trim()) {
      setUniqueIdError("Project Name is required.");
      return;
    }
    if (!values.customer.trim()) {
      setCustomersError("Select a customer from the list.");
      return;
    }

    setUniqueIdError(null);
    setSaving(true);
    try {
      const result = await onSubmit?.({
        ...values,
        uniqueId,
        fullName,
        engineer: values.engineer.trim() || undefined,
        pmName: values.pmName.trim() || undefined,
        createOnBasecamp,
        createOnAts,
        qb,
      });
      // Parent returns false when Basecamp/ATS/save failed — keep dialog open.
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
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dialog-header">
          <h2 id={titleId} className="dialog-title">
            {mode === "edit" ? "Edit Project" : "New Project"}
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
            <span className="field-label">
              Project Name <span className="field-required" aria-hidden="true">*</span>
            </span>
            <input
              className="field-input"
              type="text"
              name="projectName"
              value={values.projectName}
              onChange={(event) =>
                updateField("projectName", event.target.value)
              }
              required
              aria-required="true"
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">
              Customer <span className="field-required" aria-hidden="true">*</span>
            </span>
            <div className="search-combobox" ref={customerComboboxRef}>
              <input
                className="field-input"
                type="text"
                name="customerSearch"
                value={customerQuery}
                placeholder={
                  customersLoading
                    ? "Loading customers…"
                    : "Search client name or code, or scroll the list"
                }
                disabled={customersLoading || customers.length === 0}
                required
                aria-required="true"
                onChange={(event) => {
                  setCustomerQuery(event.target.value);
                  updateField("customer", "");
                  setShowCustomerSuggestions(true);
                  setCustomersError(null);
                }}
                onFocus={() => setShowCustomerSuggestions(true)}
                onClick={() => setShowCustomerSuggestions(true)}
                onKeyDown={handleCustomerKeyDown}
                role="combobox"
                aria-expanded={showCustomerSuggestions}
                aria-controls={customerListId}
                aria-autocomplete="list"
                autoComplete="off"
              />

              {showCustomerSuggestions ? (
                <div
                  id={customerListId}
                  className="search-suggestions"
                  role="listbox"
                >
                  {customerMatches.length === 0 ? (
                    <p className="search-empty">No matching customers.</p>
                  ) : (
                    customerMatches.map((customer, index) => (
                      <button
                        key={customer.id}
                        type="button"
                        role="option"
                        aria-selected={index === customerHighlight}
                        className={
                          index === customerHighlight
                            ? "search-option active"
                            : "search-option"
                        }
                        onMouseEnter={() => setCustomerHighlight(index)}
                        onClick={() => pickCustomer(customer)}
                      >
                        <span className="search-option-title">
                          {customer.customerName.trim() ||
                            customer.customerId.trim()}
                        </span>
                        <span className="search-option-meta">
                          {customer.customerId}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              ) : (
                <span className="field-hint">
                  Type to search by client name or code, or click to scroll and
                  pick.
                </span>
              )}
            </div>
            {customersError ? (
              <span className="field-hint error">{customersError}</span>
            ) : customers.length === 0 && !customersLoading ? (
              <span className="field-hint">
                Add a customer in the Customer Name tab first.
              </span>
            ) : null}
          </label>

          <label className="field">
            <span className="field-label">Award Date</span>
            <input
              className="field-input field-date"
              type="date"
              name="awardDate"
              value={values.awardDate}
              onChange={(event) => handleAwardDateChange(event.target.value)}
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Year</span>
            <input
              className="field-input"
              type="text"
              name="year"
              inputMode="numeric"
              pattern="[0-9]{2}"
              maxLength={2}
              placeholder="19"
              value={values.year}
              onChange={(event) =>
                updateField(
                  "year",
                  event.target.value.replace(/\D/g, "").slice(0, 2),
                )
              }
              required
            />
          </label>

          <label className="field">
            <span className="field-label">No</span>
            <input
              className="field-input"
              type="text"
              name="no"
              value={values.no}
              onChange={(event) => updateField("no", event.target.value)}
              required
            />
            {values.customer.trim() && values.year.trim().length >= 2 ? (
              noSuggestion ? (
                <span className="field-hint">
                  Highest UniqueID already used for {values.customer.trim()}
                  {values.year.trim().slice(-2)}:{" "}
                  <strong>{noSuggestion.maxUniqueId}</strong> (No{" "}
                  {noSuggestion.maxNoLabel}). Suggested next:{" "}
                  <button
                    type="button"
                    className="inline-link suggestion-link"
                    onClick={() =>
                      updateField("no", noSuggestion.suggestedNext)
                    }
                  >
                    {noSuggestion.suggestedNext}
                  </button>
                </span>
              ) : (
                <span className="field-hint">
                  No UniqueIDs yet for {values.customer.trim()}
                  {values.year.trim().slice(-2)}. Suggested start:{" "}
                  <button
                    type="button"
                    className="inline-link suggestion-link"
                    onClick={() => updateField("no", "001")}
                  >
                    001
                  </button>
                </span>
              )
            ) : (
              <span className="field-hint">
                Select Customer and Year to see the highest UniqueID already
                used.
              </span>
            )}
          </label>

          <label className="field">
            <span className="field-label">UniqueID</span>
            <input
              className="field-input field-input--readonly"
              type="text"
              value={uniqueId}
              readOnly
              tabIndex={-1}
            />
            {uniqueIdError || uniqueIdConflict ? (
              <span className="field-hint error">
                {uniqueIdError || uniqueIdConflict}
              </span>
            ) : null}
          </label>

          <label className="field">
            <span className="field-label">Full Name</span>
            <input
              className="field-input field-input--readonly"
              type="text"
              value={fullName}
              readOnly
              tabIndex={-1}
            />
          </label>

          <label className="field">
            <span className="field-label">Engineer (optional)</span>
            <select
              className="field-input field-select"
              name="engineer"
              value={values.engineer}
              disabled={engineersLoading}
              onChange={(event) =>
                updateField("engineer", event.target.value)
              }
            >
              <option value="">
                {engineersLoading
                  ? "Loading ATS users…"
                  : "Select engineer (optional)"}
              </option>
              {values.engineer.trim() &&
              !engineers.some((user) => user.name === values.engineer.trim()) ? (
                <option value={values.engineer.trim()}>
                  {values.engineer.trim()}
                </option>
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

          <label className="field">
            <span className="field-label">PM Name (optional)</span>
            <select
              className="field-input field-select"
              name="pmName"
              value={values.pmName}
              disabled={engineersLoading}
              onChange={(event) => updateField("pmName", event.target.value)}
            >
              <option value="">
                {engineersLoading
                  ? "Loading ATS users…"
                  : "Select PM (optional)"}
              </option>
              {values.pmName.trim() &&
              !engineers.some((user) => user.name === values.pmName.trim()) ? (
                <option value={values.pmName.trim()}>
                  {values.pmName.trim()}
                </option>
              ) : null}
              {engineers.map((user) => (
                <option key={`pm-${user.id}`} value={user.name}>
                  {user.name}
                </option>
              ))}
            </select>
            {engineersError ? (
              <span className="field-hint error">{engineersError}</span>
            ) : (
              <span className="field-hint">
                Active users from ATS / Timesheets.
              </span>
            )}
          </label>

          <div className="field">
            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={qb}
                disabled={saving}
                onChange={(event) => setQb(event.target.checked)}
              />
              <span>QB</span>
            </label>
            <span className="field-hint">
              Checked = Yes, unchecked = No on Project Naming.
            </span>

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={createOnBasecamp}
                disabled={basecampLocked || saving}
                onChange={(event) =>
                  setCreateOnBasecamp(event.target.checked)
                }
              />
              <span>Create on Basecamp?</span>
            </label>
            {basecampLocked ? (
              <span className="field-hint">
                Already created on Basecamp for this project (read-only).
              </span>
            ) : createOnBasecamp ? (
              basecampStatusLoading ? (
                <span className="field-hint">Checking Basecamp…</span>
              ) : basecampConnected ? (
                <span className="field-hint">
                  Connected. Creates a Basecamp project named with the Full
                  Name. Skips create if that name already exists on Basecamp.
                </span>
              ) : (
                <span className="field-hint">
                  <a className="inline-link" href="/api/basecamp/auth">
                    Connect Basecamp
                  </a>{" "}
                  first, then save again with this checked.
                </span>
              )
            ) : null}

            <label className="checkbox-row">
              <input
                type="checkbox"
                checked={createOnAts}
                disabled={atsLocked || saving}
                onChange={(event) => setCreateOnAts(event.target.checked)}
              />
              <span>Create on ATS?</span>
            </label>
            {atsLocked ? (
              <span className="field-hint">
                Already created on ATS for this project (read-only).
              </span>
            ) : createOnAts ? (
              atsStatusLoading ? (
                <span className="field-hint">Checking ATS connection…</span>
              ) : atsConfigured ? (
                <span className="field-hint">
                  Configured. Creates a Timesheets project named with the Full
                  Name. Skips create if that name already exists on ATS.
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
              disabled={
                saving ||
                customersLoading ||
                !values.customer ||
                Boolean(uniqueIdConflict)
              }
            >
              {saving ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
