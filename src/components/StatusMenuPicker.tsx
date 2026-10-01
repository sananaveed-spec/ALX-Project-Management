"use client";

import { useEffect, useId, useRef, useState } from "react";
import {
  PROJECT_STATUS_MENU,
  isProjectStatusMenuValue,
  type StatusMenuGroup,
} from "@/lib/project-status-menu";

type StatusMenuPickerProps = {
  value: string;
  disabled?: boolean;
  ariaLabel: string;
  onPick: (nextStatus: string) => void;
};

export function StatusMenuPicker({
  value,
  disabled = false,
  ariaLabel,
  onPick,
}: StatusMenuPickerProps) {
  const [open, setOpen] = useState(false);
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuId = useId();
  const trimmed = value.trim();
  const isLegacy = Boolean(trimmed) && !isProjectStatusMenuValue(trimmed);

  useEffect(() => {
    if (!open) {
      return;
    }
    function onPointerDown(event: MouseEvent) {
      if (
        rootRef.current &&
        !rootRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
        setOpenGroup(null);
      }
    }
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setOpenGroup(null);
      }
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  function pick(next: string) {
    setOpen(false);
    setOpenGroup(null);
    if (next === value) {
      return;
    }
    onPick(next);
  }

  function toggleGroup(group: StatusMenuGroup) {
    setOpenGroup((current) =>
      current === group.label ? null : group.label,
    );
  }

  return (
    <div className="status-menu" ref={rootRef}>
      <button
        type="button"
        className="field-input field-select table-select table-select--status status-menu-trigger"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        onClick={() => {
          if (disabled) {
            return;
          }
          setOpen((current) => {
            if (current) {
              setOpenGroup(null);
              return false;
            }
            return true;
          });
        }}
      >
        <span className="status-menu-trigger-label">
          {trimmed || "Select status"}
        </span>
        <span className="status-menu-trigger-caret" aria-hidden>
          ▾
        </span>
      </button>

      {open ? (
        <div
          id={menuId}
          className="status-menu-dropdown"
          role="menu"
          aria-label="Status options"
        >
          <button
            type="button"
            className="status-menu-item"
            role="menuitem"
            onClick={() => pick("")}
          >
            Select status
          </button>

          {isLegacy ? (
            <button
              type="button"
              className="status-menu-item status-menu-item--current"
              role="menuitem"
              onClick={() => pick(trimmed)}
            >
              {trimmed} (current)
            </button>
          ) : null}

          {PROJECT_STATUS_MENU.map((entry) => {
            if (entry.type === "leaf") {
              const selected =
                trimmed.toLowerCase() === entry.value.toLowerCase();
              return (
                <button
                  key={entry.value}
                  type="button"
                  className={
                    selected
                      ? "status-menu-item status-menu-item--selected"
                      : "status-menu-item"
                  }
                  role="menuitem"
                  onClick={() => pick(entry.value)}
                >
                  {entry.value}
                </button>
              );
            }

            const groupOpen = openGroup === entry.label;
            const childSelected = entry.children.some(
              (child) => child.toLowerCase() === trimmed.toLowerCase(),
            );
            return (
              <div key={entry.label} className="status-menu-group">
                <button
                  type="button"
                  className={
                    childSelected || groupOpen
                      ? "status-menu-item status-menu-item--group status-menu-item--selected"
                      : "status-menu-item status-menu-item--group"
                  }
                  role="menuitem"
                  aria-haspopup="menu"
                  aria-expanded={groupOpen}
                  onClick={() => toggleGroup(entry)}
                >
                  <span>{entry.label}</span>
                  <span aria-hidden>{groupOpen ? "▾" : "▸"}</span>
                </button>
                {groupOpen ? (
                  <div
                    className="status-menu-submenu"
                    role="menu"
                    aria-label={entry.label}
                  >
                    {entry.children.map((child) => {
                      const selected =
                        trimmed.toLowerCase() === child.toLowerCase();
                      return (
                        <button
                          key={child}
                          type="button"
                          className={
                            selected
                              ? "status-menu-item status-menu-item--selected"
                              : "status-menu-item"
                          }
                          role="menuitem"
                          onClick={() => pick(child)}
                        >
                          {child}
                        </button>
                      );
                    })}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
