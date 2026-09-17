"use client";

import { useEffect, useId, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";

export type NewCustomerFormValues = {
  customerId: string;
  customerName: string;
  email: string;
  pocName: string;
  pocEmail: string;
  billToAddress: string;
  apNumber: string;
};

type NewCustomerDialogProps = {
  open: boolean;
  onClose: () => void;
  onSubmit?: (values: NewCustomerFormValues) => void;
  mode?: "create" | "edit";
  initialValues?: NewCustomerFormValues | null;
};

const emptyForm: NewCustomerFormValues = {
  customerId: "",
  customerName: "",
  email: "",
  pocName: "",
  pocEmail: "",
  billToAddress: "",
  apNumber: "",
};

export function NewCustomerDialog({
  open,
  onClose,
  onSubmit,
  mode = "create",
  initialValues = null,
}: NewCustomerDialogProps) {
  const titleId = useId();
  const [values, setValues] = useState<NewCustomerFormValues>(emptyForm);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

    setValues(initialValues ?? emptyForm);
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
  ]);

  if (!open || !mounted) {
    return null;
  }

  function updateField<K extends keyof NewCustomerFormValues>(
    key: K,
    value: NewCustomerFormValues[K],
  ) {
    setValues((current) => ({ ...current, [key]: value }));
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onSubmit?.(values);
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
          {mode === "edit" ? "Edit Customer" : "New Customer"}
        </h2>

        <form className="dialog-form" onSubmit={handleSubmit}>
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
            <span className="field-label">Email</span>
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

          <div className="dialog-actions">
            <button
              type="button"
              className="button secondary"
              onClick={onClose}
            >
              Cancel
            </button>
            <button type="submit" className="button primary">
              Save
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
