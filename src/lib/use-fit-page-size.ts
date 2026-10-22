"use client";

import { useEffect, useState, type RefObject } from "react";

type FitPageSizeOptions = {
  /** Estimated body row height used to fill the viewport. */
  rowHeight?: number;
  headerHeight?: number;
  minRows?: number;
  maxRows?: number;
};

/** Rows that fit the scroll container so the table doesn't need vertical scroll. */
export function useFitPageSize(
  containerRef: RefObject<HTMLElement | null>,
  {
    rowHeight = 38,
    headerHeight = 42,
    minRows = 6,
    maxRows = 60,
  }: FitPageSizeOptions = {},
  /** Change this when the table mounts/unmounts so we re-attach the observer. */
  observeKey?: unknown,
) {
  const [pageSize, setPageSize] = useState(minRows);

  useEffect(() => {
    let observer: ResizeObserver | null = null;
    let raf = 0;
    let tries = 0;

    function measure(el: HTMLElement) {
      const height = el.clientHeight;
      if (height <= 0) {
        return false;
      }

      const headerEl = el.querySelector("thead");
      const measuredHeader =
        headerEl?.getBoundingClientRect().height || headerHeight;
      const usable = height - measuredHeader;
      if (usable <= 0) {
        return false;
      }

      // Use a stable estimate so tall wrapping cells don't under-count rows.
      const rows = Math.floor(usable / rowHeight);
      const next = Math.min(maxRows, Math.max(minRows, rows));
      setPageSize((current) => (current === next ? current : next));
      return true;
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

      measure(el);
      raf = window.requestAnimationFrame(() => {
        measure(el);
        // One more pass after flex layout settles.
        window.setTimeout(() => measure(el), 50);
      });

      observer = new ResizeObserver(() => {
        measure(el);
      });
      observer.observe(el);
    }

    attach();

    return () => {
      if (raf) {
        window.cancelAnimationFrame(raf);
      }
      observer?.disconnect();
    };
  }, [
    containerRef,
    rowHeight,
    headerHeight,
    minRows,
    maxRows,
    observeKey,
  ]);

  return pageSize;
}
