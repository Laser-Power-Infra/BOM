"use client";

import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import ComparisonTable from "@/components/comparison/comparison-table";

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
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

export default function GoogleSheetUpload() {
  const [fetching, setFetching] = useState(true);
  const [comparing, setComparing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
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
          <span>{fetching ? "Fetching sheet data..." : "Comparing sheets..."}</span>
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

  return (
    <div className="flex flex-col space-y-4">
      <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        <div className="bg-gradient-to-r from-violet-600 to-violet-700 px-5 py-3">
          <h4 className="text-sm font-semibold text-white">Comparison Summary</h4>
        </div>
        <div className="p-4">
          <div className="flex flex-wrap gap-3">
            <div className="flex items-center gap-1.5">
              <Badge className="bg-emerald-600 text-[10px]">{compareResult.summary.totalMatched}</Badge>
              <span className="text-xs text-slate-600">Matched</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50">
                {compareResult.summary.unmatchedInFileA}
              </Badge>
              <span className="text-xs text-slate-600">Only in NON CHAIN BOM</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-200 bg-amber-50">
                {compareResult.summary.unmatchedInFileB}
              </Badge>
              <span className="text-xs text-slate-600">Only in MRP/IS</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Badge variant="secondary" className="text-[10px]">{compareResult.summary.mapsApplied}</Badge>
              <span className="text-xs text-slate-600">Maps applied</span>
            </div>
          </div>
        </div>
      </div>
      <ComparisonTable
        itemSchedules={compareResult.itemSchedules}
        maps={compareResult.maps}
      />
    </div>
  );
}
