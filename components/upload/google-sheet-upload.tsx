"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import ComparisonTable from "@/components/comparison/comparison-table";
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
  summary: CompareSummary;
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
  const [fetching, setFetching] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(
    null,
  );
  const mountedRef = useRef(false);

  useEffect(() => {
    if (mountedRef.current) return;
    mountedRef.current = true;

    let cancelled = false;

    async function run() {
      const fetchToast = toast.loading("Fetching data from Google Sheets...");

      try {
        const fetchRes = await fetch("/api/sheet-fetch", { method: "POST" });
        const fetchData = await fetchRes.json();

        if (cancelled) return;

        if (!fetchRes.ok || !fetchData.success) {
          toast.dismiss(fetchToast);
          setError(fetchData.error || "Fetch failed");
          setFetching(false);
          return;
        }

        toast.dismiss(fetchToast);
        setFetching(false);
        setComparing(true);

        const compareToast = toast.loading("Comparing sheets...");

        const compareRes = await fetch("/api/compare", { method: "POST" });
        const compareData: CompareResponse = await compareRes.json();

        if (cancelled) return;

        toast.dismiss(compareToast);

        if (!compareRes.ok || !compareData.success) {
          setError(compareData.error || "Compare failed");
          setComparing(false);
          return;
        }

        setCompareResult(compareData);
        setComparing(false);

        toast.success("Comparison complete", {
          description: `${compareData.summary.totalMatched} matched · ${compareData.summary.unmatchedInFileA} only in A · ${compareData.summary.unmatchedInFileB} only in B`,
        });
      } catch {
        if (!cancelled) {
          toast.dismiss();
          setError("Network error. Please try again.");
          setFetching(false);
          setComparing(false);
        }
      }
    }

    run();

    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-red-200 bg-red-50 p-12 text-sm text-red-600">
        {error}
      </div>
    );
  }

  if (fetching || comparing) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <Spinner />
          <span>
            {fetching ? "Fetching sheet data..." : "Comparing sheets..."}
          </span>
        </div>
      </div>
    );
  }

  if (!compareResult || !compareResult.itemSchedules || !compareResult.maps) {
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
    "finalOutput",
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
        defaultWidth: 120,
        sortable: true,
      });

      if (field !== "finalOutput" && field !== "ccvSioplas") {
        cols.push({
          header: "Percentage Difference",
          accessor: (field + "Diff") as keyof ItemSchedule,
          defaultWidth: 180,
          sortable: true,
        });
        // Insert PVC columns after insulation
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
    <div className="flex flex-col space-y-4">
      {/* <ComparisonTable
        itemSchedules={compareResult.itemSchedules}
        maps={compareResult.maps}
      /> */}
      <OptimizedTenderTable
        title="Matched Items (Optimized)"
        columns={generateComparisonColumns()}
        rows={compareResult.itemSchedules}
        rowKey="id"
      />
    </div>
  );
}
