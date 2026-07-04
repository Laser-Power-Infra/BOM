"use client";

import { useEffect, useState } from "react";
import ComparisonTable from "@/components/comparison/comparison-table";

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
  uploadSessionId: number;
  itemCode: string;
  itemScheduleName: string;
  [key: string]: unknown;
}

interface ComparisonDashboardProps {
  sessionId: number;
}

export default function ComparisonDashboard({
  sessionId,
}: ComparisonDashboardProps) {
  const [loading, setLoading] = useState(true);
  const [itemSchedules, setItemSchedules] = useState<ItemSchedule[]>([]);
  const [maps, setMaps] = useState<MapItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      try {
        const res = await fetch(`/api/schedules?sessionId=${sessionId}`);
        const data = await res.json();

        if (!cancelled) {
          if (!res.ok) {
            setError(data.error || "Failed to load comparison data");
          } else {
            setItemSchedules(data.itemSchedules ?? []);
            setMaps(data.maps ?? []);
          }
        }
      } catch {
        if (!cancelled) {
          setError("Network error. Please try again.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    load();

    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12">
        <div className="flex items-center gap-2 text-sm text-slate-400">
          <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
          </svg>
          <span>Loading comparison results...</span>
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

  if (!itemSchedules.length) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-sm text-slate-400">
        No matched items to display
      </div>
    );
  }

  return <ComparisonTable itemSchedules={itemSchedules} maps={maps} />;
}
