"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  generateUniqueCustomerColor,
  isValidCustomerColor,
  normalizeCustomerColor,
  toDarkCustomerColor,
} from "@/lib/customers";

export type NewCustomerFormValues = {
  customerId: string;
  customerName: string;
  email: string;
  pocName: string;
  pocEmail: string;
  billToAddress: string;
  apNumber: string;
  color: string;
};

type NewCustomerDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit?: (values: NewCustomerFormValues) => void | boolean | Promise<boolean>;
  mode?: "create" | "edit";
  initialValues?: NewCustomerFormValues | null;
  /** Colors already used by other customers (exclude current row when editing). */
  reservedColors?: string[];
  /** Stack above another open dialog (e.g. New Project). */
  nested?: boolean;
};

const emptyForm: NewCustomerFormValues = {
  customerId: "",
  customerName: "",
  email: "",
  pocName: "",
  pocEmail: "",
  billToAddress: "",
  apNumber: "",
  color: "#4f6bed",
};

export function NewCustomerDialog({
  open,
  onClose,
  onSubmit,
  mode = "create",
  initialValues = null,
  reservedColors = [],
  nested = false,
}: NewCustomerDialogProps) {
  const titleId = useId();
  const [values, setValues] = useState<NewCustomerFormValues>(emptyForm);
  const [mounted, setMounted] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setFormError(null);
    if (initialValues) {
      setValues({
        ...emptyForm,
        ...initialValues,
        color:
          normalizeCustomerColor(initialValues.color) ||
          generateUniqueCustomerColor(reservedColors),
      });
      return;
    }

    setValues({
      ...emptyForm,
      color: generateUniqueCustomerColor(reservedColors),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentional open-gated seed
  }, [
    open,
    initialValues?.customerId,
    initialValues?.customerName,
    initialValues?.email,
    initialValues?.pocName,
    initialValues?.pocEmail,
    initialValues?.billToAddress,
    initialValues?.apNumber,
    initialValues?.color,
  ]);

  if (!open || !mounted) {
    return null;
  }

  function updateField<K extends keyof NewCustomerFormValues>(
    key: K,
    value: NewCustomerFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
    if (key === "color") {
      setFormError(null);
    }
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const color = toDarkCustomerColor(values.color);
    if (!isValidCustomerColor(color)) {
      setFormError("Choose a dark color that reads well on white.");
      return;
    }

    const reserved = new Set(
      reservedColors
        .map((item) => toDarkCustomerColor(item) || normalizeCustomerColor(item))
        .filter(Boolean),
    );
    if (reserved.has(color)) {
      setFormError("This color is already assigned to another customer.");
      return;
    }

    const payload = { ...values, color };
    setSaving(true);
    setFormError(null);
    try {
      const result = await onSubmit?.(payload);
      if (result === false) {
        return;
      }
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return createPortal(
    <div
      className={
        nested ? "dialog-backdrop dialog-backdrop--nested" : "dialog-backdrop"
      }
      role="presentation"
    >
      <div
        className="dialog-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="dialog-header">
          <h2 id={titleId} className="dialog-title">
            {mode === "edit" ? "Edit Customer" : "New Customer"}
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

        <form className="dialog-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="field">
            <span className="field-label">Customer ID</span>
            <input
              className="field-input"
              type="text"
              name="customerId"
              value={values.customerId}
              onChange={(event) =>
                updateField("customerId", event.target.value)
              }
              required
              autoFocus
            />
          </label>

          <label className="field">
            <span className="field-label">Customer Name</span>
            <input
              className="field-input"
              type="text"
              name="customerName"
              value={values.customerName}
              onChange={(event) =>
                updateField("customerName", event.target.value)
              }
              required
            />
          </label>

          <label className="field">
            <span className="field-label">Color</span>
            <span className="field-color-row">
              <input
                className="field-color-picker"
                type="color"
                name="color"
                value={
                  toDarkCustomerColor(values.color) ||
                  normalizeCustomerColor(values.color) ||
                  "#4f6bed"
                }
                onChange={(event) =>
                  updateField(
                    "color",
                    toDarkCustomerColor(event.target.value) ||
                      event.target.value,
                  )
                }
                aria-label="Customer color"
              />
              <input
                className="field-input field-color-hex"
                type="text"
                value={values.color}
                onChange={(event) => updateField("color", event.target.value)}
                onBlur={() => {
                  const darkened = toDarkCustomerColor(values.color);
                  if (darkened && darkened !== values.color) {
                    updateField("color", darkened);
                  }
                }}
                placeholder="#4f6bed"
                spellCheck={false}
              />
            </span>
            <span className="field-hint">
              Dark colors only — must stay readable on a white background.
            </span>
          </label>

          <label className="field">
            <span className="field-label">AP Email</span>
            <input
              className="field-input"
              type="text"
              name="email"
              value={values.email}
              onChange={(event) => updateField("email", event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">POC Name</span>
            <input
              className="field-input"
              type="text"
              name="pocName"
              value={values.pocName}
              onChange={(event) => updateField("pocName", event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">POC Email</span>
            <input
              className="field-input"
              type="text"
              name="pocEmail"
              value={values.pocEmail}
              onChange={(event) => updateField("pocEmail", event.target.value)}
            />
          </label>

          <label className="field">
            <span className="field-label">Bill To Address</span>
            <textarea
              className="field-input field-textarea"
              name="billToAddress"
              rows={3}
              value={values.billToAddress}
              onChange={(event) =>
                updateField("billToAddress", event.target.value)
              }
            />
          </label>

          <label className="field">
            <span className="field-label">A/P Number</span>
            <input
              className="field-input"
              type="text"
              name="apNumber"
              value={values.apNumber}
              onChange={(event) => updateField("apNumber", event.target.value)}
            />
          </label>

          {formError ? (
            <p className="form-message error" role="alert">
              {formError}
            </p>
          ) : null}

          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </button>
            <button type="submit" className="button primary" disabled={saving}>
              Save
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
