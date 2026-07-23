"use client";

import { useState, useEffect, useRef } from "react";
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
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    async function loadExisting() {
      try {
        const res = await fetch("/api/schedules");
        const result: CompareResponse = await res.json();
        if (result.success) {
          setData(result);
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
      if (!compareResult.success) throw new Error(compareResult.error || "Compare failed");

      const schedulesRes = await fetch("/api/schedules");
      const schedulesResult: CompareResponse = await schedulesRes.json();
      if (schedulesResult.success) {
        setData(schedulesResult);
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
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-sm text-slate-400">
        No data available
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
    // "pvcInner",
    // "pvcOuter",
    "filler",
    "polyt",
    "spclConstruction",
    // "finalOutput",
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
      // Add visual gap after spclConstruction column
      // if (field === "spclConstruction") {
      //   cols.push({
      //     header: "",
      //     accessor: "_spacer" as keyof ItemSchedule,
      //     defaultWidth: 16,
      //     sortable: false,
      //     resizable: false,
      //     renderCell: () => null,
      //   });
      // }
    }
    return cols;
  }

  return (
    <div className="flex flex-col space-y-4">
      <OptimizedTenderTable
        title="Matched Items (Optimized)"
        columns={generateComparisonColumns()}
        rows={data.itemSchedules}
        rowKey="id"
        onSync={handleSync}
        syncing={syncing}
      />
    </div>
  );
}
