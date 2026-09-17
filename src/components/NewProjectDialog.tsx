"use client";

import { useEffect, useId, useMemo, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import type { CustomerEntry } from "@/lib/customers";
import {
  buildFullName,
  buildUniqueId,
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
  createOnBasecamp?: boolean;
  createOnAts?: boolean;
};

type ProjectFormFields = Omit<
  NewProjectFormValues,
  "uniqueId" | "fullName" | "createOnBasecamp" | "createOnAts"
>;


type NewProjectDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit?: (values: NewProjectFormValues) => void;
  mode?: "create" | "edit";
  initialValues?: ProjectFormFields | null;
  existingProjects?: ProjectEntry[];
  excludeProjectId?: string | null;
};

const emptyForm: ProjectFormFields = {
  projectName: "",
  customer: "",
  awardDate: "",
  year: "",
  no: "",
};

export function NewProjectDialog({
  open,
  onClose,
  onSubmit,
  mode = "create",
  initialValues = null,
  existingProjects = [],
  excludeProjectId = null,
}: NewProjectDialogProps) {
  const titleId = useId();
  const [values, setValues] = useState<ProjectFormFields>(emptyForm);
  const [mounted, setMounted] = useState(false);
  const [customerIds, setCustomerIds] = useState<string[]>([]);
  const [customersLoading, setCustomersLoading] = useState(false);
  const [customersError, setCustomersError] = useState<string | null>(null);
  const [uniqueIdError, setUniqueIdError] = useState<string | null>(null);
  const [createOnBasecamp, setCreateOnBasecamp] = useState(false);
  const [basecampConnected, setBasecampConnected] = useState(false);
  const [basecampStatusLoading, setBasecampStatusLoading] = useState(false);
  const [createOnAts, setCreateOnAts] = useState(false);
  const [atsConfigured, setAtsConfigured] = useState(false);
  const [atsStatusLoading, setAtsStatusLoading] = useState(false);

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

  const customerOptions = useMemo(() => {
    const ids = [...customerIds];
    if (values.customer && !ids.includes(values.customer)) {
      ids.unshift(values.customer);
    }
    return ids;
  }, [customerIds, values.customer]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setValues(initialValues ?? emptyForm);
    setUniqueIdError(null);
    setCreateOnBasecamp(false);
    setCreateOnAts(false);
    // Only seed when the dialog opens (or switches to a different record).
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open-gated seed
  }, [
    open,
    initialValues?.projectName,
    initialValues?.customer,
    initialValues?.awardDate,
    initialValues?.year,
    initialValues?.no,
  ]);

  useEffect(() => {
    setUniqueIdError(null);
  }, [uniqueId]);

  useEffect(() => {
    if (!open) {
      return;
    }

    let cancelled = false;

    async function loadCustomerIds() {
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
        const ids = [
          ...new Set(
            (data.customers ?? [])
              .map((customer) => customer.customerId.trim())
              .filter(Boolean),
          ),
        ].sort((a, b) => a.localeCompare(b));

        if (!cancelled) {
          setCustomerIds(ids);
        }
      } catch (error) {
        if (!cancelled) {
          setCustomerIds([]);
          setCustomersError(
            error instanceof Error
              ? error.message
              : "Could not load customers.",
          );
        }
      } finally {
        if (!cancelled) {
          setCustomersLoading(false);
        }
      }
    }

    void loadCustomerIds();
    return () => {
      cancelled = true;
    };
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

  if (!open || !mounted) {
    return null;
  }

  function updateField<K extends keyof ProjectFormFields>(
    key: K,
    value: ProjectFormFields[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleAwardDateChange(dateValue: string) {
    setValues((current) => {
      const next = {
        ...current,
        awardDate: dateValue,
      };

      if (dateValue) {
        next.year = dateValue.slice(2, 4);
      }

      return next;
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
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

    setUniqueIdError(null);
    onSubmit?.({
      ...values,
      uniqueId,
      fullName,
      createOnBasecamp,
      createOnAts,
    });
    onClose();
  }

  return createPortal(
    <div
      className="dialog-backdrop"
      role="presentation"
      onClick={onClose}
    >
      <div
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id={titleId} className="dialog-title">
          {mode === "edit" ? "Edit Project" : "New Project"}
        </h2>

        <form className="dialog-form" onSubmit={handleSubmit}>
          <label className="field">
            <span className="field-label">Project Name</span>
            <input
              className="field-input"
              type="text"
              name="projectName"
              value={values.projectName}
              onChange={(event) =>
                updateField("projectName", event.target.value)
              }
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">Customer</span>
            <select
              className="field-input field-select"
              name="customer"
              value={values.customer}
              onChange={(event) => updateField("customer", event.target.value)}
              required
              disabled={customersLoading || customerOptions.length === 0}
            >
              <option value="">
                {customersLoading
                  ? "Loading customers…"
                  : customerOptions.length === 0
                    ? "No customers found"
                    : "Select customer ID"}
              </option>
              {customerOptions.map((customerId) => (
                <option key={customerId} value={customerId}>
                  {customerId}
                </option>
              ))}
            </select>
            {customersError ? (
              <span className="field-hint error">{customersError}</span>
            ) : customerIds.length === 0 && !customersLoading ? (
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
          </label>

          <label className="field">
            <span className="field-label">UniqueID</span>
            <input
              className="field-input field-input--readonly"
              type="text"
              name="uniqueId"
              value={uniqueId}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
            />
            {uniqueIdError || uniqueIdConflict ? (
              <span className="field-hint error" role="alert">
                {uniqueIdError || uniqueIdConflict}
              </span>
            ) : null}
          </label>

          <label className="field">
            <span className="field-label">Full Name</span>
            <input
              className="field-input field-input--readonly"
              type="text"
              name="fullName"
              value={fullName}
              readOnly
              tabIndex={-1}
              aria-readonly="true"
            />
          </label>

          {mode === "create" ? (
            <div className="field">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={createOnBasecamp}
                  onChange={(event) =>
                    setCreateOnBasecamp(event.target.checked)
                  }
                />
                <span>Create on Basecamp?</span>
              </label>
              {createOnBasecamp ? (
                basecampStatusLoading ? (
                  <span className="field-hint">Checking Basecamp connection…</span>
                ) : basecampConnected ? (
                  <span className="field-hint">
                    Connected. Creates a Basecamp project named with the Full
                    Name and files it into the TestBySana folder.
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
          ) : null}

          {mode === "create" ? (
            <div className="field">
              <label className="checkbox-row">
                <input
                  type="checkbox"
                  checked={createOnAts}
                  onChange={(event) => setCreateOnAts(event.target.checked)}
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
          ) : null}

          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="button primary"
              disabled={
                customersLoading ||
                !values.customer ||
                Boolean(uniqueIdConflict)
              }
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
