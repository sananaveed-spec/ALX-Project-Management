"use client";

import { useEffect, useRef, useState, type RefObject } from "react";

type FitPageSizeOptions = {
  /** Estimated body row height used to fill the viewport. */
  rowHeight?: number;
  headerHeight?: number;
  minRows?: number;
  maxRows?: number;
  /** Extra bottom space reserved inside the wrap (scrollbar safety). */
  bottomReserve?: number;
};

/**
 * Rows that fit the scroll container so the table doesn't need vertical scroll.
 *
 * Strategy (stable, no jerk loop):
 * 1) Estimate from container height ÷ rowHeight
 * 2) After paint, only SHRINK while the table overflows
 * 3) Never grow again until the container height changes meaningfully
 */
export function useFitPageSize(
  containerRef: RefObject<HTMLElement | null>,
  {
    rowHeight = 38,
    headerHeight = 42,
    minRows = 6,
    maxRows = 60,
    bottomReserve = 18,
  }: FitPageSizeOptions = {},
  observeKey?: unknown,
) {
  const [pageSize, setPageSize] = useState(minRows);
  const lockedRef = useRef<{ height: number; rows: number } | null>(null);

  useEffect(() => {
    let observer: ResizeObserver | null = null;
    let raf = 0;
    let tries = 0;
    let debounce: number | null = null;
    lockedRef.current = null;

    function usableBody(el: HTMLElement) {
      const height = el.clientHeight;
      if (height <= 0) {
        return { height: 0, header: headerHeight, usable: 0 };
      }
      const headerEl = el.querySelector("thead");
      const header =
        headerEl?.getBoundingClientRect().height || headerHeight;
      // Always keep room for a horizontal scrollbar track.
      const usable = height - header - bottomReserve;
      return { height, header, usable: Math.max(0, usable) };
    }

    function isOverflowing(el: HTMLElement) {
      const table = el.querySelector("table");
      if (!table) {
        return false;
      }
      // scrollHeight > clientHeight means vertical clip under overflow-y:hidden
      return el.scrollHeight > el.clientHeight + 1;
    }

    function estimateRows(el: HTMLElement) {
      const { usable } = usableBody(el);
      if (usable <= 0) {
        return minRows;
      }
      return Math.min(
        maxRows,
        Math.max(minRows, Math.floor(usable / rowHeight)),
      );
    }

    function applyEstimate(el: HTMLElement) {
      const { height } = usableBody(el);
      if (height <= 0) {
        return;
      }
      const rows = estimateRows(el);
      lockedRef.current = { height, rows };
      setPageSize(rows);
    }

    function shrinkIfNeeded(el: HTMLElement) {
      if (!isOverflowing(el)) {
        return;
      }
      setPageSize((current) => {
        if (current <= minRows) {
          return current;
        }
        const next = current - 1;
        const locked = lockedRef.current;
        if (locked) {
          lockedRef.current = { ...locked, rows: next };
        }
        return next;
      });
    }

    function onContainerResize(el: HTMLElement) {
      const { height } = usableBody(el);
      if (height <= 0) {
        return;
      }
      const locked = lockedRef.current;
      // Same viewport size → only allow shrink (fixes clip without jerking up/down).
      if (locked && Math.abs(height - locked.height) < 20) {
        shrinkIfNeeded(el);
        return;
      }
      applyEstimate(el);
      window.requestAnimationFrame(() => shrinkIfNeeded(el));
    }

    function schedule(el: HTMLElement) {
      if (debounce) {
        window.clearTimeout(debounce);
      }
      debounce = window.setTimeout(() => onContainerResize(el), 80);
    }

    function attach() {
      const el = containerRef.current;
      if (!el) {
        tries += 1;
        if (tries < 30) {
          raf = window.requestAnimationFrame(attach);
        }
        return;
      }
      applyEstimate(el);
      window.requestAnimationFrame(() => {
        shrinkIfNeeded(el);
        window.setTimeout(() => shrinkIfNeeded(el), 100);
      });
      observer = new ResizeObserver(() => schedule(el));
      observer.observe(el);
    }

    attach();

    return () => {
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
      if (debounce) {
        window.clearTimeout(debounce);
      }
      observer?.disconnect();
    };
  }, [
    containerRef,
    rowHeight,
    headerHeight,
    minRows,
    maxRows,
    bottomReserve,
    observeKey,
  ]);

  // After React paints a new pageSize, shrink once more if still clipped.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) {
      return;
    }
    const id = window.setTimeout(() => {
      if (el.scrollHeight > el.clientHeight + 1) {
        setPageSize((current) => {
          if (current <= minRows) {
            return current;
          }
          const next = current - 1;
          const locked = lockedRef.current;
          if (locked) {
            lockedRef.current = { ...locked, rows: next };
          }
          return next;
        });
      }
    }, 40);
    return () => window.clearTimeout(id);
  }, [pageSize, containerRef, minRows, observeKey]);

  return pageSize;
}
