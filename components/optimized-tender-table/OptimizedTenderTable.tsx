"use client";

import React, {
  useState,
  useMemo,
  useRef,
  useCallback,
  useEffect,
} from "react";
import "./OptimizedTenderTable.css";
import { format } from "date-fns";
import * as XLSX from "xlsx";

export interface ColumnDef<T> {
  header: string;
  accessor: keyof T | string;
  defaultWidth?: number;
  align?: "left" | "right" | "center";
  type?:
    | "string"
    | "number"
    | "date"
    | "boolean"
    | "percentage"
    | "currency"
    | "status"
    | "decision"
    | "custom";
  sortable?: boolean;
  resizable?: boolean;
  renderCell?: (value: unknown, row: T) => React.ReactNode;
  renderExpanded?: (row: T) => React.ReactNode;
}

export interface OptimizedTenderTableProps<T extends Record<string, unknown>> {
  columns: ColumnDef<T>[];
  rows: T[];
  title?: string;
  rowKey?: keyof T;
  onSync?: () => void;
  syncing?: boolean;
}

export function OptimizedTenderTable<T extends Record<string, unknown>>({
  columns,
  rows,
  title = "Data Table",
  rowKey = "id" as keyof T,
  onSync,
  syncing = false,
}: OptimizedTenderTableProps<T>) {
  const [globalSearch, setGlobalSearch] = useState<string>("");
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [rowsPerPage, setRowsPerPage] = useState<number>(50);
  const [sortColumn, setSortColumn] = useState<string | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("desc");
  const [columnFilters, setColumnFilters] = useState<Record<string, string>>(
    {},
  );
  const [multiSelectFilters, setMultiSelectFilters] = useState<
    Record<string, string[]>
  >({});
  const [rangeFilters, setRangeFilters] = useState<
    Record<string, { min: string; max: string }>
  >({});
  const [openFilterCol, setOpenFilterCol] = useState<string | null>(null);
  const [dropdownPos, setDropdownPos] = useState<{
    top: number;
    left: number;
    width: number;
  } | null>(null);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => {
      const initialWidths: Record<string, number> = {};
      columns.forEach((col) => {
        initialWidths[String(col.accessor)] = col.defaultWidth ?? 150;
      });
      return initialWidths;
    },
  );

  const [expandedRows, setExpandedRows] = useState<Record<string, boolean>>({});

  const scrollContainerRef = useRef<HTMLDivElement>(null);

  const resizingColumnRef = useRef<string | null>(null);
  const startXRef = useRef<number>(0);
  const startWidthRef = useRef<number>(0);
  const handleResetFilters = useCallback(() => {
    setGlobalSearch("");
    setColumnFilters({});
    setMultiSelectFilters({});
    setRangeFilters({});
    setSortColumn(null);
    setSortDirection("asc");
    setCurrentPage(1);
    setOpenFilterCol(null);
    setDropdownPos(null);
  }, []);

  const handleResizeStart = useCallback(
    (e: React.MouseEvent, accessor: string, currentWidth: number) => {
      e.preventDefault();
      e.stopPropagation();
      resizingColumnRef.current = accessor;
      startXRef.current = e.clientX;
      startWidthRef.current = currentWidth;
      document.addEventListener("mousemove", handleResizeMove);
      document.addEventListener("mouseup", handleResizeEnd);
      document.body.style.cursor = "col-resize";
    },
    [],
  );

  const handleResizeMove = useCallback((e: MouseEvent) => {
    if (!resizingColumnRef.current) return;
    const diff = e.clientX - startXRef.current;
    const newWidth = Math.max(50, startWidthRef.current + diff);
    setColumnWidths((prev) => ({
      ...prev,
      [resizingColumnRef.current!]: newWidth,
    }));
  }, []);

  const handleResizeEnd = useCallback(() => {
    resizingColumnRef.current = null;
    document.removeEventListener("mousemove", handleResizeMove);
    document.removeEventListener("mouseup", handleResizeEnd);
    document.body.style.cursor = "default";
  }, [handleResizeMove]);

  const handleSort = useCallback(
    (accessor: string) => {
      if (sortColumn === accessor) {
        setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      } else {
        setSortColumn(accessor);
        setSortDirection("desc");
      }
      setCurrentPage(1);
    },
    [sortColumn],
  );

  const toggleRowExpansion = useCallback((keyValue: string) => {
    setExpandedRows((prev) => ({
      ...prev,
      [keyValue]: !prev[keyValue],
    }));
  }, []);

  const getRowKey = useCallback(
    (row: T): string => {
      const id = row[rowKey];
      if (id !== undefined) {
        const ki = (row as any)._keyIndex;
        return ki !== undefined ? `${String(id)}-${ki}` : String(id);
      }
      return Math.random().toString();
    },
    [rowKey],
  );

  const processedRows = useMemo(() => {
    let result = rows.map(
      (row, idx) => ({ ...row, _keyIndex: idx }) as unknown as T,
    );

    if (globalSearch.trim() !== "") {
      const searchLower = globalSearch.toLowerCase().trim();
      result = result.filter((row) => {
        return columns.some((col) => {
          const val = row[col.accessor as keyof T];
          if (val === null || val === undefined) return false;
          return String(val).toLowerCase().includes(searchLower);
        });
      });
    }
    Object.entries(columnFilters).forEach(([col, filterVal]) => {
      if (!filterVal) return;
      const lower = filterVal.toLowerCase();
      result = result.filter((row) => {
        const val = row[col as keyof T];
        return val != null && String(val).toLowerCase().includes(lower);
      });
    });
    Object.entries(multiSelectFilters).forEach(([col, selected]) => {
      if (!selected.length) return;
      result = result.filter((row) => {
        const val = String(row[col as keyof T] ?? "");
        return selected.includes(val);
      });
    });
    Object.entries(rangeFilters).forEach(([col, range]) => {
      if (!range.min && !range.max) return;
      result = result.filter((row) => {
        const raw = String(row[col as keyof T] ?? "");
        const num = parseFloat(raw.replace(/[^-\d.]/g, ""));
        if (!isFinite(num)) return false;
        if (range.min !== "" && num < parseFloat(range.min)) return false;
        if (range.max !== "" && num > parseFloat(range.max)) return false;
        return true;
      });
    });

    if (sortColumn) {
      result.sort((a, b) => {
        const valA = a[sortColumn as keyof T];
        const valB = b[sortColumn as keyof T];

        if (valA === null || valA === undefined)
          return sortDirection === "asc" ? -1 : 1;
        if (valB === null || valB === undefined)
          return sortDirection === "asc" ? 1 : -1;

        if (valA instanceof Date && valB instanceof Date) {
          return sortDirection === "asc"
            ? valA.getTime() - valB.getTime()
            : valB.getTime() - valA.getTime();
        }

        if (typeof valA === "number" && typeof valB === "number") {
          return sortDirection === "asc" ? valA - valB : valB - valA;
        }
        // Generic numeric sort: try to extract number from any string
        const strA = String(valA).trim();
        const strB = String(valB).trim();
        const cleanedA = strA.replace(/[^-\d.]/g, "");
        const cleanedB = strB.replace(/[^-\d.]/g, "");
        const numA = cleanedA ? parseFloat(cleanedA) : NaN;
        const numB = cleanedB ? parseFloat(cleanedB) : NaN;
        if (isFinite(numA) && isFinite(numB)) {
          return sortDirection === "asc" ? numA - numB : numB - numA;
        }
        // Handle Inf: sort after finite numbers
        const isInfA = strA.includes("+Inf") || strA.includes("-Inf");
        const isInfB = strB.includes("+Inf") || strB.includes("-Inf");
        if (isInfA || isInfB) {
          const rank = (s: string) =>
            s.includes("-Inf") ? -2 : s.includes("+Inf") ? 2 : 0;
          const rA = isInfA ? rank(strA) : 1;
          const rB = isInfB ? rank(strB) : 1;
          return sortDirection === "asc" ? rA - rB : rB - rA;
        }
        return sortDirection === "asc"
          ? strA.localeCompare(strB)
          : strB.localeCompare(strA);
      });
    }

    return result;
  }, [
    rows,
    globalSearch,
    sortColumn,
    sortDirection,
    columns,
    columnFilters,
    multiSelectFilters,
    rangeFilters,
  ]);

  const totalRecords = processedRows.length;
  const totalPages = Math.ceil(totalRecords / rowsPerPage) || 1;
  const activePage = Math.min(currentPage, totalPages);

  const paginatedRows = useMemo(() => {
    const startIndex = (activePage - 1) * rowsPerPage;
    return processedRows.slice(startIndex, startIndex + rowsPerPage);
  }, [processedRows, activePage, rowsPerPage]);

  useEffect(() => {
    setCurrentPage(1);
  }, [globalSearch, rowsPerPage]);

  const handleExportExcel = useCallback(() => {
    const exportData = processedRows.map((row) => {
      const obj: Record<string, string> = {};
      for (const col of columns) {
        const accessor = String(col.accessor);
        const label = col.header;
        let val = String(row[accessor as keyof T] ?? "");
        obj[label] = val.length > 32767 ? val.slice(0, 32767) : val;
      }
      return obj;
    });
    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tenders");
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `tenders-${date}.xlsx`);
  }, [columns, processedRows]);

  const formatCurrency = useCallback(
    (val: number | null | undefined): string => {
      if (val === null || val === undefined) return "-";
      return new Intl.NumberFormat("en-IN", {
        maximumFractionDigits: 0,
      }).format(val);
    },
    [],
  );

  const formatDate = useCallback(
    (val: Date | string | number | null | undefined): string => {
      if (!val) return "-";
      const d = new Date(val);
      if (isNaN(d.getTime())) return "-";
      return format(d, "do MMM, yyyy");
    },
    [],
  );

  const formatPercentage = useCallback(
    (val: number | null | undefined): string => {
      if (val === null || val === undefined) return "-";
      const prefix = val > 0 ? "+" : "";
      return `${prefix}${(val * 100).toFixed(1)}%`;
    },
    [],
  );

  const renderCell = useCallback(
    (col: ColumnDef<T>, row: T): React.ReactNode => {
      const value = row[col.accessor as keyof T];

      if (col.renderCell) {
        return col.renderCell(value, row);
      }

      if (col.type === "currency") {
        return formatCurrency(value as number | null | undefined);
      }

      if (col.type === "percentage") {
        return formatPercentage(value as number | null | undefined);
      }

      if (col.type === "date") {
        return formatDate(value as Date | string | number | null | undefined);
      }

      if (col.type === "boolean") {
        const isTrue = Boolean(value);
        return (
          <span
            className={`ra-icon ${isTrue ? "applicable" : "not-applicable"}`}
          >
            {isTrue ? "✔" : "○"}
          </span>
        );
      }

      if (col.type === "status") {
        const statusVal = String(value ?? "").toUpperCase();
        const statusClass =
          statusVal === "WON"
            ? "won"
            : statusVal === "LOST"
              ? "lost"
              : statusVal === "UNDER_EVALUATION" || statusVal === "EVAL"
                ? "eval"
                : statusVal === "SUBMITTED"
                  ? "submitted"
                  : statusVal === "RA_PENDING" || statusVal === "LOI"
                    ? "loi"
                    : "";
        return (
          <span className={`status-badge ${statusClass}`}>
            {value != null ? String(value) : "-"}
          </span>
        );
      }

      if (col.type === "decision") {
        const decVal = String(value ?? "").toUpperCase();
        const decClass =
          decVal === "GO"
            ? "go"
            : decVal === "NO_GO" || decVal === "NOGO"
              ? "nogo"
              : "";
        return (
          <span className={`decision-badge ${decClass}`}>
            {value != null ? String(value) : "-"}
          </span>
        );
      }

      return value !== null && value !== undefined ? String(value) : "-";
    },
    [formatCurrency, formatPercentage, formatDate],
  );

  const getColumnAlignClass = useCallback((col: ColumnDef<T>): string => {
    if (col.align === "right") return "col-currency";
    if (col.align === "center") return "col-center";
    if (col.type === "currency") return "col-currency";
    if (col.type === "percentage") return "col-percentage";
    if (
      col.type === "boolean" ||
      col.type === "status" ||
      col.type === "decision"
    )
      return "col-center";
    return "";
  }, []);

  return (
    <div className="optimized-tender-table-container">
      <div className="optimized-tender-table-toolbar">
        <div className="toolbar-left">
          <h2 className="table-title">{title}</h2>
          <span className="record-count-badge">
            {totalRecords} Records Total
          </span>
          <div className="global-search-container">
            <span className="search-icon">🔍</span>
            <input
              type="text"
              className="global-search-input"
              placeholder="Search..."
              value={globalSearch}
              onChange={(e) => setGlobalSearch(e.target.value)}
            />
          </div>
        </div>
        <div className="toolbar-right">
          {onSync && (
            <button className="sync-btn" onClick={onSync} disabled={syncing}>
              {syncing ? "⟳ Syncing..." : "⟳ Sync"}
            </button>
          )}
          <button className="reset-btn" onClick={handleResetFilters}>
            ⟳ Reset Filters
          </button>
          <button className="export-btn" onClick={handleExportExcel}>
            📊 Export Excel
          </button>
        </div>
      </div>

      <div className="optimized-tender-table-wrapper" ref={scrollContainerRef}>
        <table className="optimized-tender-data-table">
          <thead>
            <tr>
              <th
                style={{ width: "40px", left: 0, zIndex: 11 }}
                className="col-center"
              ></th>
              {columns.map((col) => {
                const accessor = String(col.accessor);
                const showFilter =
                  accessor === "bomId" ||
                  accessor === "itemCode" ||
                  accessor === "itemScheduleName" ||
                  accessor === "option2" ||
                  accessor === "itemName" ;
                const isDiffColumn = accessor.endsWith("Diff") || accessor === "sheetTotalDiff";
                return (
                  <th
                    key={accessor}
                    style={{
                      width: `${columnWidths[accessor]}px`,
                      ...(accessor === "bomId" || accessor === "itemCode"
                        ? {
                            position: "sticky" as const,
                            zIndex: 10,
                            left:
                              accessor === "bomId"
                                ? "40px"
                                : `calc(40px + ${columnWidths["bomId"]}px)`,
                          }
                        : {}),
                    }}
                  >
                    <div
                      className="header-content"
                      onClick={() =>
                        col.sortable !== false && handleSort(accessor)
                      }
                    >
                      <span>{col.header}</span>
                      {sortColumn === accessor && (
                        <span className="sort-indicator">
                          {sortDirection === "asc" ? "▲" : "▼"}
                        </span>
                      )}
                    </div>
                    {(showFilter && accessor === "itemScheduleName") ||
                    accessor === "option2" ||
                    accessor === "itemName" ? (
                      <div style={{ marginTop: "4px" }}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (openFilterCol === accessor) {
                              setOpenFilterCol(null);
                              setDropdownPos(null);
                            } else {
                              const rect = (
                                e.currentTarget as HTMLElement
                              ).getBoundingClientRect();
                              setDropdownPos({
                                top: rect.bottom,
                                left: rect.left,
                                width: rect.width,
                              });
                              setOpenFilterCol(accessor);
                            }
                          }}
                          style={{
                            width: "100%",
                            fontSize: "11px",
                            padding: "2px 6px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            background: "white",
                            cursor: "pointer",
                            textAlign: "left",
                          }}
                        >
                          {multiSelectFilters[accessor]?.length
                            ? `${multiSelectFilters[accessor].length} selected`
                            : `Filter ${col.header}...`}
                        </button>
                        {openFilterCol === accessor && dropdownPos && (
                          <>
                            <div
                              style={{
                                position: "fixed",
                                inset: 0,
                                zIndex: 9998,
                              }}
                              onClick={() => {
                                setOpenFilterCol(null);
                                setDropdownPos(null);
                              }}
                            />
                            <div
                              style={{
                                position: "fixed",
                                top: dropdownPos.top,
                                left: dropdownPos.left,
                                width: dropdownPos.width,
                                maxHeight: "200px",
                                overflowY: "auto",
                                background: "white",
                                border: "1px solid #ccc",
                                borderRadius: "3px",
                                zIndex: 9999,
                                padding: "4px",
                              }}
                            >
                              {multiSelectFilters[accessor]?.length ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    setMultiSelectFilters(p => ({...p, [accessor]: []}));
                                    setCurrentPage(1);
                                  }}
                                  style={{
                                    width: "100%",
                                    fontSize: "10px",
                                    padding: "2px 4px",
                                    marginBottom: "4px",
                                    border: "1px solid #ccc",
                                    borderRadius: "3px",
                                    background: "#f5f5f5",
                                    cursor: "pointer",
                                  }}
                                >
                                  Clear selection
                                </button>
                              ) : null}
                              {[
                                ...new Set(
                                  rows.map((r) =>
                                    String(r[accessor as keyof T] ?? ""),
                                  ),
                                ),
                              ]
                                .filter(Boolean)
                                .sort()
                                .map((val) => (
                                  <label
                                    key={val}
                                    style={{
                                      display: "flex",
                                      alignItems: "center",
                                      gap: "4px",
                                      fontSize: "11px",
                                      padding: "2px 0",
                                      cursor: "pointer",
                                    }}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={
                                        multiSelectFilters[accessor]?.includes(
                                          val,
                                        ) ?? false
                                      }
                                      onChange={() => {
                                        setMultiSelectFilters((prev) => {
                                          const current = prev[accessor] || [];
                                          const next = current.includes(val)
                                            ? current.filter((v) => v !== val)
                                            : [...current, val];
                                          return { ...prev, [accessor]: next };
                                        });
                                        setCurrentPage(1);
                                      }}
                                    />
                                    {val}
                                  </label>
                                ))}
                            </div>
                          </>
                        )}
                      </div>
                    ) : isDiffColumn ? (
                      <div
                        style={{
                          marginTop: "4px",
                          display: "flex",
                          gap: "4px",
                          alignItems: "center",
                        }}
                      >
                        <input
                          type="text"
                          placeholder="Min"
                          value={rangeFilters[accessor]?.min ?? ""}
                          onChange={(e) => {
                            setRangeFilters((prev) => ({
                              ...prev,
                              [accessor]: { ...prev[accessor], min: e.target.value },
                            }));
                            setCurrentPage(1);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: "40%",
                            padding: "2px 4px",
                            fontSize: "10px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            boxSizing: "border-box",
                            background: "white",
                            color: "#333",
                          }}
                        />
                        <span style={{ fontSize: "10px", color: "#888" }}>-</span>
                        <input
                          type="text"
                          placeholder="Max"
                          value={rangeFilters[accessor]?.max ?? ""}
                          onChange={(e) => {
                            setRangeFilters((prev) => ({
                              ...prev,
                              [accessor]: { ...prev[accessor], max: e.target.value },
                            }));
                            setCurrentPage(1);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: "40%",
                            padding: "2px 4px",
                            fontSize: "10px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            boxSizing: "border-box",
                            background: "white",
                            color: "#333",
                          }}
                        />
                        {(rangeFilters[accessor]?.min || rangeFilters[accessor]?.max) ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setRangeFilters((prev) => ({ ...prev, [accessor]: { min: "", max: "" } }));
                              setCurrentPage(1);
                            }}
                            style={{
                              padding: "2px 4px",
                              fontSize: "10px",
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              color: "#999",
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ) : showFilter ? (
                      <div style={{ position: "relative", marginTop: "4px" }}>
                        <input
                          type="text"
                          placeholder={`Filter ${col.header}...`}
                          value={columnFilters[accessor] || ""}
                          onChange={(e) => {
                            setColumnFilters((prev) => ({
                              ...prev,
                              [accessor]: e.target.value,
                            }));
                            setCurrentPage(1);
                          }}
                          onClick={(e) => e.stopPropagation()}
                          style={{
                            width: "100%",
                            padding: "2px 20px 2px 6px",
                            fontSize: "11px",
                            border: "1px solid #ccc",
                            borderRadius: "3px",
                            boxSizing: "border-box",
                            background: "white",
                            color: "#333",
                          }}
                        />
                        {columnFilters[accessor] ? (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setColumnFilters((prev) => ({ ...prev, [accessor]: "" }));
                              setCurrentPage(1);
                            }}
                            style={{
                              position: "absolute",
                              right: "2px",
                              top: "50%",
                              transform: "translateY(-50%)",
                              padding: "0 4px",
                              fontSize: "12px",
                              border: "none",
                              background: "transparent",
                              cursor: "pointer",
                              color: "#999",
                              lineHeight: "1",
                            }}
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    ) : null}
                    {col.resizable !== false && (
                      <div
                        className="column-resizer"
                        onMouseDown={(e) =>
                          handleResizeStart(e, accessor, columnWidths[accessor])
                        }
                      />
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {paginatedRows.length === 0 ? (
              <tr>
                <td colSpan={columns.length + 1} className="empty-state">
                  No matching records found.
                </td>
              </tr>
            ) : (
              paginatedRows.map((row) => {
                const rowKeyValue = getRowKey(row);
                const isExpanded = !!expandedRows[rowKeyValue];

                return (
                  <React.Fragment key={rowKeyValue}>
                    <tr
                      className={`tender-row ${isExpanded ? "expanded-row" : ""}`}
                    >
                      <td
                        style={{
                          position: "sticky",
                          left: 0,
                          zIndex: 1,
                          background: "white",
                        }}
                        className="col-center"
                      >
                        {" "}
                        {columns.some((c) => c.renderExpanded) && (
                          <button
                            className="details-link"
                            onClick={() => toggleRowExpansion(rowKeyValue)}
                          >
                            {isExpanded ? "▼" : "▶"}
                          </button>
                        )}
                      </td>

                      {columns.map((col) => {
                        const cellClass = getColumnAlignClass(col);
                        const cellContent = renderCell(col, row);

                        return (
                          <td
                            key={String(col.accessor)}
                            className={cellClass}
                            style={{
                              width: `${columnWidths[String(col.accessor)]}px`,
                              ...(String(col.accessor) === "bomId" ||
                              String(col.accessor) === "itemCode"
                                ? {
                                    position: "sticky" as const,
                                    zIndex: 1,
                                    background: "white",
                                    left:
                                      String(col.accessor) === "bomId"
                                        ? "40px"
                                        : `calc(40px + ${columnWidths["bomId"]}px)`,
                                  }
                                : {}),
                            }}
                          >
                            <div
                              style={{
                                maxHeight: 80,
                                overflowY: "auto",
                                whiteSpace: "normal",
                              }}
                            >
                              {cellContent}
                            </div>
                          </td>
                        );
                      })}
                    </tr>

                    {isExpanded && columns.some((c) => c.renderExpanded) && (
                      <tr className="details-panel-row">
                        <td colSpan={columns.length + 1}>
                          <div className="details-panel-content">
                            <div className="details-grid">
                              {columns
                                .filter((c) => c.renderExpanded)
                                .map((col) => (
                                  <div
                                    key={String(col.accessor)}
                                    className="details-item span-full"
                                  >
                                    <span className="details-label">
                                      {col.header}
                                    </span>
                                    <span className="details-value">
                                      {col.renderExpanded
                                        ? col.renderExpanded(row)
                                        : "-"}
                                    </span>
                                  </div>
                                ))}
                            </div>
                          </div>
                        </td>
                      </tr>
                    )}
                  </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      <div className="optimized-tender-table-footer">
        <div className="footer-left">
          <span>Rows per page:</span>
          <select
            className="rows-per-page-select"
            value={rowsPerPage}
            onChange={(e) => {
              setRowsPerPage(Number(e.target.value));
              setCurrentPage(1);
            }}
          >
            <option value={10}>10</option>
            <option value={25}>25</option>
            <option value={50}>50</option>
            <option value={100}>100</option>
            <option value={1000}>1000</option>
          </select>
        </div>

        <div className="footer-center">
          Showing {totalRecords > 0 ? (activePage - 1) * rowsPerPage + 1 : 0} -{" "}
          {Math.min(activePage * rowsPerPage, totalRecords)} of {totalRecords}
        </div>

        <div className="footer-right">
          <button
            className="page-btn"
            onClick={() => setCurrentPage(1)}
            disabled={activePage === 1}
          >
            FIRST
          </button>
          <button
            className="page-btn"
            onClick={() => setCurrentPage((prev) => Math.max(1, prev - 1))}
            disabled={activePage === 1}
          >
            PREV
          </button>

          {Array.from({ length: Math.min(5, totalPages) }, (_, idx) => {
            let pageNum = idx + 1;
            if (totalPages > 5 && activePage > 3) {
              pageNum = activePage - 3 + idx;
              if (pageNum + (4 - idx) > totalPages) {
                pageNum = totalPages - 4 + idx;
              }
            }
            return (
              <button
                key={pageNum}
                className={`page-btn ${activePage === pageNum ? "active" : ""}`}
                onClick={() => setCurrentPage(pageNum)}
              >
                {pageNum}
              </button>
            );
          })}

          {totalPages > 5 && activePage < totalPages - 2 && (
            <>
              <span style={{ padding: "0 4px", color: "rgba(0,0,0,0.4)" }}>
                ...
              </span>
              <button
                className={`page-btn ${activePage === totalPages ? "active" : ""}`}
                onClick={() => setCurrentPage(totalPages)}
              >
                {totalPages}
              </button>
            </>
          )}

          <button
            className="page-btn"
            onClick={() =>
              setCurrentPage((prev) => Math.min(totalPages, prev + 1))
            }
            disabled={activePage === totalPages}
          >
            NEXT
          </button>
          <button
            className="page-btn"
            onClick={() => setCurrentPage(totalPages)}
            disabled={activePage === totalPages}
          >
            LAST
          </button>
        </div>
      </div>
    </div>
  );
}
