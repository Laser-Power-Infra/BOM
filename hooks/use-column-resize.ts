"use client";

import { useState, useCallback, useRef, useEffect } from "react";

const DEFAULT_MIN_WIDTH = 60;
const DEFAULT_MAX_WIDTH = 800;

function computeDefaultWidth(columnCount: number): number {
  if (!columnCount) return 160;
  return Math.min(Math.max(900 / columnCount, 130), 280);
}

export function useColumnResize(
  columns: string[],
  options?: { minWidth?: number; maxWidth?: number }
) {
  const minWidth = options?.minWidth ?? DEFAULT_MIN_WIDTH;
  const maxWidth = options?.maxWidth ?? DEFAULT_MAX_WIDTH;

  const defaultWidth = computeDefaultWidth(columns.length);

  const [widths, setWidths] = useState<Map<string, number>>(() => {
    const map = new Map<string, number>();
    for (const col of columns) {
      map.set(col, defaultWidth);
    }
    return map;
  });

  const isResizingRef = useRef(false);
  const [isResizing, setIsResizing] = useState(false);
  const activeColRef = useRef<string | null>(null);
  const startXRef = useRef(0);
  const startWidthRef = useRef(0);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    setWidths((prev) => {
      const map = new Map(prev);
      let changed = false;
      for (const col of columns) {
        if (!map.has(col)) {
          map.set(col, defaultWidth);
          changed = true;
        }
      }
      for (const key of map.keys()) {
        if (!columns.includes(key)) {
          map.delete(key);
          changed = true;
        }
      }
      return changed ? map : prev;
    });
  }, [columns, defaultWidth]);

  const handlePointerMove = useCallback(
    (e: PointerEvent) => {
      if (!isResizingRef.current || !activeColRef.current) return;

      const diff = e.clientX - startXRef.current;
      const newWidth = Math.max(
        minWidth,
        Math.min(maxWidth, startWidthRef.current + diff)
      );

      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(() => {
        setWidths((prev) => {
          const map = new Map(prev);
          map.set(activeColRef.current!, newWidth);
          return map;
        });
      });
    },
    [minWidth, maxWidth]
  );

  const handlePointerUp = useCallback(() => {
    isResizingRef.current = false;
    setIsResizing(false);
    activeColRef.current = null;
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    document.removeEventListener("pointermove", handlePointerMove);
    document.removeEventListener("pointerup", handlePointerUp);
    document.body.style.cursor = "";
    document.body.style.userSelect = "";
  }, [handlePointerMove]);

  useEffect(() => {
    return () => {
      isResizingRef.current = false;
      document.removeEventListener("pointermove", handlePointerMove);
      document.removeEventListener("pointerup", handlePointerUp);
    };
  }, [handlePointerMove, handlePointerUp]);

  const getWidth = useCallback(
    (col: string): number => widths.get(col) ?? defaultWidth,
    [widths, defaultWidth]
  );

  const getResizeHandlers = useCallback(
    (col: string) => ({
      onPointerDown: (e: React.PointerEvent) => {
        e.preventDefault();
        e.stopPropagation();
        isResizingRef.current = true;
        setIsResizing(true);
        activeColRef.current = col;
        startXRef.current = e.clientX;
        startWidthRef.current = widths.get(col) ?? defaultWidth;

        document.addEventListener("pointermove", handlePointerMove);
        document.addEventListener("pointerup", handlePointerUp);
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      },
    }),
    [widths, defaultWidth, handlePointerMove, handlePointerUp]
  );

  return { getWidth, getResizeHandlers, isResizing };
}
