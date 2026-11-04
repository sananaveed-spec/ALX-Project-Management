"use client";

import { useEffect, useState } from "react";
import { useMsal } from "@azure/msal-react";
import {
  getAccountEmail,
  isAllowedOrganizationEmail,
} from "@/auth/organization";
import {
  TODO_EMAIL_FROM,
  TODO_EMAIL_TO,
  type TodoEmailKind,
  type TodoEmailLastRun,
} from "@/lib/todo-email";

type TodayDecision = {
  send: boolean;
  dateKey: string;
  kind: TodoEmailKind | null;
  reason: string;
};

type TodayPreview = {
  dateKey: string;
  kind: TodoEmailKind;
  subject: string;
  html: string;
  rowCount: number;
};

export function TodoEmailSchedulePanel() {
  const { accounts, instance } = useMsal();
  const account = accounts[0] ?? instance.getActiveAccount();
  const signedInEmail = getAccountEmail(account ?? undefined);
  const canView = isAllowedOrganizationEmail(signedInEmail);

  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [toValue, setToValue] = useState(TODO_EMAIL_TO);
  const [savingTo, setSavingTo] = useState(false);
  const [todayDecision, setTodayDecision] = useState<TodayDecision | null>(
    null,
  );
  const [todayPreview, setTodayPreview] = useState<TodayPreview | null>(null);
  const [lastRun, setLastRun] = useState<TodoEmailLastRun | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/api/todo-email", { cache: "no-store" });
        if (!response.ok) {
          throw new Error("Could not load email schedule.");
        }
        const data = (await response.json()) as {
          to?: string;
          todayDecision?: TodayDecision;
          todayPreview?: TodayPreview | null;
          lastRun?: TodoEmailLastRun | null;
        };
        if (!cancelled) {
          setToValue(data.to || TODO_EMAIL_TO);
          setTodayDecision(data.todayDecision ?? null);
          setTodayPreview(data.todayPreview ?? null);
          setLastRun(data.lastRun ?? null);
          setError(null);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : "Could not load email schedule.",
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

  async function saveToRecipients() {
    if (!canView || savingTo) {
      return;
    }
    setSavingTo(true);
    setError(null);
    setInfo(null);
    try {
      const response = await fetch("/api/todo-email", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "save-to", to: toValue }),
      });
      const data = (await response.json()) as {
        error?: string;
        message?: string;
        to?: string;
      };
      if (!response.ok) {
        throw new Error(data.error || "Failed to save To.");
      }
      if (data.to) {
        setToValue(data.to);
      }
      setInfo(data.message || "Saved To recipients.");
    } catch (saveError) {
      setError(
        saveError instanceof Error ? saveError.message : "Failed to save To.",
      );
    } finally {
      setSavingTo(false);
    }
  }

  if (!canView) {
    return (
      <div className="todo-email-panel">
        <p className="todo-email-hint">
          Sign in with an @allumiax.com account to view Email Scheduling.
        </p>
      </div>
    );
  }

  const kindLabel =
    todayPreview?.kind === "pending30"
      ? "Pending (1–30 days)"
      : todayPreview?.kind === "today"
        ? "Today To-Do"
        : "—";

  return (
    <div className="todo-email-panel">
      <div className="todo-email-header">
        <div>
          <h3 className="todo-email-title">Email Scheduling</h3>
          <p className="todo-email-subtitle">
            Live send at <strong>3:00 PM Pakistan Time</strong> via Hetzner cron.
            The server builds the list from the <em>current</em> Today / Pending
            data at send time (not weeks earlier). Mon–Thu: Today · Friday:
            Pending 1–30 days · skips weekends and Holidays. From{" "}
            {TODO_EMAIL_FROM}.
          </p>
        </div>
        <button
          type="button"
          className="button secondary"
          onClick={() => void saveToRecipients()}
          disabled={!ready || savingTo}
        >
          {savingTo ? "Saving…" : "Save To"}
        </button>
      </div>

      {error ? (
        <p className="form-message error" role="alert">
          {error}
        </p>
      ) : null}
      {info ? (
        <p className="form-message success" role="status">
          {info}
        </p>
      ) : null}

      <div className="todo-email-fields">
        <label className="field">
          <span className="field-label">From</span>
          <input
            className="field-input field-input--readonly"
            type="text"
            value={TODO_EMAIL_FROM}
            readOnly
          />
        </label>
        <label className="field">
          <span className="field-label">To</span>
          <input
            className="field-input"
            type="text"
            inputMode="email"
            value={toValue}
            disabled={!ready || savingTo}
            onChange={(event) => setToValue(event.target.value)}
            placeholder="name@allumiax.com, other@allumiax.com"
            aria-label="To recipients (comma-separated)"
          />
        </label>
        <div className="field field--wide">
          <span className="field-label">Today (PKT) decision</span>
          <div className="field-input field-input--readonly todo-email-rich">
            {!ready
              ? "Loading…"
              : todayDecision
                ? `${todayDecision.dateKey} · ${kindLabel} · ${todayDecision.reason}`
                : "—"}
          </div>
        </div>
        <div className="field field--wide">
          <span className="field-label">Last live send</span>
          <div className="field-input field-input--readonly todo-email-rich">
            {!ready
              ? "Loading…"
              : lastRun
                ? `${lastRun.dateKey} · ${lastRun.kind} · ${lastRun.rowCount} rows · ${lastRun.subject} · ${lastRun.sentAt}`
                : "No live send recorded yet."}
          </div>
        </div>
        <div className="field field--wide">
          <span className="field-label">Subject (live preview now)</span>
          <div className="field-input field-input--readonly todo-email-rich">
            {!ready
              ? "Loading…"
              : todayPreview?.subject || "No digest today (weekend/holiday)."}
          </div>
        </div>
        <div className="field field--wide">
          <span className="field-label">
            Body preview now
            {todayPreview ? ` · ${todayPreview.rowCount} rows` : ""}
          </span>
          <div className="field-input field-input--readonly todo-email-rich todo-email-rich--body">
            {!ready ? (
              "Loading…"
            ) : todayPreview?.html ? (
              <div dangerouslySetInnerHTML={{ __html: todayPreview.html }} />
            ) : (
              "—"
            )}
          </div>
          <span className="todo-email-hint">
            Preview refreshes whenever you open this tab. At 3:00 PM PKT the
            server rebuilds from Active Projects again, then sends via Graph
            app-only as sana. See DEPLOY.md for the cron command.
          </span>
        </div>
      </div>
    </div>
  );
}
