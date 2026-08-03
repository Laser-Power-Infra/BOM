"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { toast } from "sonner";
import {
  OptimizedTenderTable,
  type ColumnDef,
} from "@/components/optimized-tender-table/OptimizedTenderTable";

interface CompareSummary {
  totalMatched: number;
  unmatchedInFileA: number;
  unmatchedInFileB: number;
  mapsApplied: number;
}

interface Rule {
  id: number;
  label: string;
  value: string;
  operator: string;
  output: string;
}

interface MapItem {
  id: number;
  mapA: string;
  mapB: string;
  output: string;
  Rules: Rule[];
}

interface ItemSchedule {
  id: number;
  itemCode: string;
  itemScheduleName: string;
  [key: string]: unknown;
}

interface CompareResponse {
  success: boolean;
  summary?: CompareSummary;
  itemSchedules?: ItemSchedule[];
  maps?: MapItem[];
  error?: string;
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );
}

export default function GoogleSheetUpload() {
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [data, setData] = useState<CompareResponse | null>(null);
  const [sheetBData, setSheetBData] = useState<{
    headers: string[];
    rows: unknown[][];
  } | null>(null);
  const [sheetAData, setSheetAData] = useState<{
    headers: string[];
    rows: unknown[][];
  } | null>(null);
  const [sharedFilterCodes, setSharedFilterCodes] = useState<string[]>([]);
  const [sharedFilterBomIds, setSharedFilterBomIds] = useState<string[]>([]);
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    async function loadExisting() {
      try {
        const [schedulesRes, sheetRes] = await Promise.all([
          fetch("/api/schedules"),
          fetch("/api/sheet-data"),
        ]);
        const schedulesResult: CompareResponse = await schedulesRes.json();
        if (schedulesResult.success) {
          setData(schedulesResult);
        }
        const sheetResult = await sheetRes.json();
        if (sheetResult.success) {
          setSheetBData(sheetResult.sheetB);
          setSheetAData(sheetResult.sheetA);
        }
      } catch {
        // silent — show empty state
      } finally {
        setLoading(false);
      }
    }

    loadExisting();
  }, []);

  async function handleSync() {
    setSyncing(true);
    try {
      const fetchRes = await fetch("/api/sheet-fetch", { method: "POST" });
      if (!fetchRes.ok) throw new Error("Sheet fetch failed");

      const compareRes = await fetch("/api/compare", { method: "POST" });
      const compareResult: CompareResponse = await compareRes.json();
      if (!compareResult.success)
        throw new Error(compareResult.error || "Compare failed");

      const [schedulesRes, sheetRes] = await Promise.all([
        fetch("/api/schedules"),
        fetch("/api/sheet-data"),
      ]);
      const schedulesResult: CompareResponse = await schedulesRes.json();
      if (schedulesResult.success) {
        setData(schedulesResult);
      }
      const sheetResult = await sheetRes.json();
      if (sheetResult.success) {
        setSheetBData(sheetResult.sheetB);
        setSheetAData(sheetResult.sheetA);
      }

      toast.success("Sync complete", {
        description: `${compareResult.summary?.totalMatched ?? 0} matched`,
      });
    } catch (err) {
      toast.error("Sync failed");
    } finally {
      setSyncing(false);
    }
  }

  const handleFilterChange = useCallback((codes: string[], bomIds: string[]) => {
    setSharedFilterCodes(prev => {
      if (prev.length === codes.length && codes.every((v, i) => v === prev[i])) return prev;
      return codes;
    });
    setSharedFilterBomIds(prev => {
      if (prev.length === bomIds.length && bomIds.every((v, i) => v === prev[i])) return prev;
      return bomIds;
    });
  }, []);

  // --- Sheet B columns (second table) ---
  const L_COLUMN_INDEX = 11;

  const itemCodeIdxB = sheetBData?.headers.indexOf("Item Code") ?? -1;
  const itemNameIdxB = sheetBData?.headers.indexOf("Item Name") ?? -1;

  // --- Sheet A index lookups ---
  const fgItemIdxA = sheetAData?.headers.indexOf("FG Item") ?? -1;
  const bomCodeIdxA = sheetAData?.headers.indexOf("BOM Code") ?? -1;

  const sheetBColumns = useMemo((): ColumnDef<Record<string, string>>[] => {
    if (!sheetBData) return [];

    const headers = sheetBData.headers;
    const rows = sheetBData.rows;

    // Find last non-empty column across all rows
    let lastNonEmpty = headers.length - 1;
    for (let c = headers.length - 1; c >= L_COLUMN_INDEX; c--) {
      let hasData = false;
      for (let r = 0; r < Math.min(rows.length, 50); r++) {
        if (
          rows[r][c] !== null &&
          rows[r][c] !== undefined &&
          String(rows[r][c]).trim() !== ""
        ) {
          hasData = true;
          break;
        }
      }
      if (hasData) {
        lastNonEmpty = c;
        break;
      }
      lastNonEmpty = c - 1;
    }

    const cols: ColumnDef<Record<string, string>>[] = [];

    if (itemCodeIdxB >= 0) {
      cols.push({
        header: "Item Code",
        accessor: `_b${itemCodeIdxB}`,
        defaultWidth: 120,
        sortable: true,
      });
    }
    if (itemNameIdxB >= 0 && itemNameIdxB !== itemCodeIdxB) {
      cols.push({
        header: "Item Name",
        accessor: `_b${itemNameIdxB}`,
        defaultWidth: 220,
        sortable: true,
      });
    }
    for (let i = L_COLUMN_INDEX; i <= lastNonEmpty; i++) {
      const header = headers[i];
      if (
        header &&
        header.trim() !== "" &&
        i !== itemCodeIdxB &&
        i !== itemNameIdxB
      ) {
        cols.push({
          header,
          accessor: `_b${i}`,
          defaultWidth: 150,
          sortable: true,
        });
      }
    }

    return cols;
  }, [sheetBData, itemCodeIdxB, itemNameIdxB]);

  const combinedFilterCols = useMemo(() => {
    const cols: string[] = [];
    if (itemCodeIdxB >= 0) cols.push(`_b${itemCodeIdxB}`);
    if (itemNameIdxB >= 0) cols.push(`_b${itemNameIdxB}`);
    return cols;
  }, [itemCodeIdxB, itemNameIdxB]);

  const combinedFilterColsA = useMemo(() => {
    const cols: string[] = [];
    if (fgItemIdxA >= 0) cols.push(`_a${fgItemIdxA}`);
    if (bomCodeIdxA >= 0) cols.push(`_a${bomCodeIdxA}`);
    return cols;
  }, [fgItemIdxA, bomCodeIdxA]);

  function formatCellValue(val: unknown): string {
    const s = String(val ?? "").trim();
    if (s === "") return "";
    if (/^-?\d+(\.\d+)?$/.test(s)) {
      const num = parseFloat(s);
      if (isFinite(num)) return num.toFixed(2);
    }
    return s;
  }
  const sheetBRows = useMemo((): Record<string, string>[] => {
    if (!sheetBData) return [];
    return sheetBData.rows.map((row, idx) => {
      const obj: Record<string, string> = { _rowId: String(idx) };
      sheetBData.headers.forEach((_, i) => {
        obj[`_b${i}`] = formatCellValue(row[i]);
      });
      return obj;
    });
  }, [sheetBData]);

  // --- Sheet A columns (middle table) ---
  const sheetAColumns = useMemo((): ColumnDef<Record<string, string>>[] => {
    if (!sheetAData) return [];
    const cols: ColumnDef<Record<string, string>>[] = [];
    const headers = sheetAData.headers;
    const rows = sheetAData.rows;
    // A=0, B=1, C=2, D=3 (by position)
    [0, 1, 2, 3].forEach((i) => {
      if (i < headers.length) {
        cols.push({
          header: headers[i] || `Col ${i}`,
          accessor: `_a${i}`,
          defaultWidth: 150,
          sortable: true,
        });
      }
    });
    // Find last non-empty column
    let lastNonEmpty = headers.length - 1;
    for (let c = headers.length - 1; c >= 6; c--) {
      let hasData = false;
      for (let r = 0; r < Math.min(rows.length, 50); r++) {
        if (rows[r][c] !== null && rows[r][c] !== undefined && String(rows[r][c]).trim() !== "") {
          hasData = true; break;
        }
      }
      if (hasData) { lastNonEmpty = c; break; }
      lastNonEmpty = c - 1;
    }
    // G=6 to last non-empty
    for (let i = 6; i <= lastNonEmpty; i++) {
      const header = headers[i];
      if (header && header.trim() !== "") {
        cols.push({
          header,
          accessor: `_a${i}`,
          defaultWidth: 150,
          sortable: true,
        });
      }
    }
    return cols;
  }, [sheetAData]);

  const sheetARows = useMemo((): Record<string, string>[] => {
    if (!sheetAData) return [];
    return sheetAData.rows.map((row, idx) => {
      const obj: Record<string, string> = { _aRowId: String(idx) };
      sheetAData.headers.forEach((_, i) => {
        obj[`_a${i}`] = formatCellValue(row[i]);
      });
      return obj;
    });
  }, [sheetAData]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Spinner />
          <span>Loading data...</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-12 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (!data || !data.itemSchedules || !data.maps) {
    return (
      <div className="flex flex-col space-y-4">
        {sheetAColumns.length > 0 && (
          <OptimizedTenderTable
            title="Sheet A Data"
            columns={sheetAColumns}
            rows={sheetARows}
            rowKey="_aRowId"
            enableFilters={true}
            combinedFilterColumns={combinedFilterColsA}
            filterKeyAccessors={{ itemCode: `_a${fgItemIdxA}`, bomId: `_a${bomCodeIdxA}` }}
            onFilterChange={handleFilterChange}
            syncItemCodes={sharedFilterCodes}
            syncBomIds={sharedFilterBomIds}
          />
        )}
        {sheetBColumns.length > 0 && (
          <OptimizedTenderTable
            title="Sheet B Data"
            columns={sheetBColumns}
            rows={sheetBRows}
            rowKey="_rowId"
            enableFilters={true}
            combinedFilterColumns={combinedFilterCols}
            filterKeyAccessors={{ itemCode: `_b${itemCodeIdxB}`, bomId: "" }}
            onFilterChange={handleFilterChange}
            syncItemCodes={sharedFilterCodes}
            syncBomIds={sharedFilterBomIds}
          />
        )}
      </div>
    );
  }

  const ALL_OUTPUT_FIELDS = [
    "option2",
    "ccvSioplas",
    "cuTape",
    "alCu",
    "alloy",
    "armour",
    "semicon",
    "insulation",
    "filler",
    "polyt",
    "spclConstruction",
  ] as const;

  function formatHeaderLabel(output: string): string {
    return output
      .replace(/([A-Z])/g, " $1")
      .trim()
      .toLowerCase()
      .replace(/^\w/, (c) => c.toUpperCase());
  }

  function generateComparisonColumns(): ColumnDef<ItemSchedule>[] {
    const cols: ColumnDef<ItemSchedule>[] = [
      {
        header: "BOM ID",
        accessor: "bomId" as keyof ItemSchedule,
        defaultWidth: 120,
        sortable: true,
      },
      {
        header: "Item Code",
        accessor: "itemCode",
        defaultWidth: 120,
        sortable: true,
      },
      {
        header: "Item Schedule",
        accessor: "itemScheduleName",
        defaultWidth: 150,
        sortable: true,
      },
      {
        header: "Item Name",
        accessor: "itemName" as keyof ItemSchedule,
        defaultWidth: 220,
        sortable: true,
      },
      {
        header: "Sheet Total PD",
        accessor: "sheetTotalDiff" as keyof ItemSchedule,
        defaultWidth: 120,
        sortable: true,
      },
    ];

    for (const field of ALL_OUTPUT_FIELDS) {
      cols.push({
        header: field === "option2" ? "Type" : formatHeaderLabel(field),
        accessor: field,
        defaultWidth: field === "spclConstruction" ? 150 : 120,
        sortable: true,
      });

      if (field !== "ccvSioplas" && field !== "spclConstruction") {
        cols.push({
          header: "Percentage Difference",
          accessor: (field + "Diff") as keyof ItemSchedule,
          defaultWidth: 180,
          sortable: true,
        });
        if (field === "insulation") {
          cols.push({
            header: "PVC Inner/Outer",
            accessor: "pvcInner" as keyof ItemSchedule,
            defaultWidth: 120,
            sortable: true,
            renderCell: (value, row) => {
              const rowAny = row as Record<string, unknown>;
              return String(rowAny.pvcInner || rowAny.pvcOuter || "-");
            },
          });
          cols.push({
            header: "Percentage Difference",
            accessor: "pvcOuterInnerDiff" as keyof ItemSchedule,
            defaultWidth: 180,
            sortable: true,
          });
        }
      }
    }
    return cols;
  }

  return (
    <div className="flex flex-col space-y-6">
      <OptimizedTenderTable
        title="Matched Items (Optimized)"
        columns={generateComparisonColumns()}
        rows={data.itemSchedules}
        rowKey="id"
        onSync={handleSync}
        syncing={syncing}
        combinedFilterColumns={["itemScheduleName", "itemName"]}
        onFilterChange={handleFilterChange}
        syncItemCodes={sharedFilterCodes}
        syncBomIds={sharedFilterBomIds}
      />
      {sheetAColumns.length > 0 && (
        <OptimizedTenderTable
          title="Sheet A Data"
          columns={sheetAColumns}
          rows={sheetARows}
          rowKey="_aRowId"
          enableFilters={true}
          combinedFilterColumns={combinedFilterColsA}
          filterKeyAccessors={{ itemCode: `_a${fgItemIdxA}`, bomId: `_a${bomCodeIdxA}` }}
          onFilterChange={handleFilterChange}
          syncItemCodes={sharedFilterCodes}
          syncBomIds={sharedFilterBomIds}
        />
      )}
      {sheetBColumns.length > 0 && (
        <OptimizedTenderTable
          title="Sheet B Data"
          columns={sheetBColumns}
          rows={sheetBRows}
          rowKey="_rowId"
          enableFilters={true}
          combinedFilterColumns={combinedFilterCols}
          filterKeyAccessors={{ itemCode: `_b${itemCodeIdxB}`, bomId: "" }}
          onFilterChange={handleFilterChange}
          syncItemCodes={sharedFilterCodes}
          syncBomIds={sharedFilterBomIds}
        />
      )}
    </div>
  );
}
