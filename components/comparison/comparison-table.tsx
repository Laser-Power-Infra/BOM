"use client";

import { useMemo } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useColumnResize } from "@/hooks/use-column-resize";

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

interface ComparisonTableProps {
  itemSchedules: ItemSchedule[];
  maps: MapItem[];
}

const outputBadgeColor: Record<string, string> = {
  PLUS_PLUS: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  PLUS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  ZERO: "bg-slate-100 text-slate-600 dark:bg-slate-800/30 dark:text-slate-400",
  MINUS: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  MINUS_MINUS: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
};

const outputDisplayLabel: Record<string, string> = {
  PLUS_PLUS: "++",
  PLUS: "+",
  ZERO: "(0)",
  MINUS: "-",
  MINUS_MINUS: "--",
};

function formatHeaderLabel(output: string): string {
  return output
    .replace(/([A-Z])/g, " $1")
    .trim()
    .toLowerCase()
    .replace(/^\w/, (c) => c.toUpperCase());
}

export default function ComparisonTable({
  itemSchedules,
  maps,
}: ComparisonTableProps) {
  const columns = useMemo(() => {
    const cols = ["itemCode", "itemScheduleName"];
    if (maps) {
      for (const map of maps) {
        cols.push(map.output);
        cols.push(map.output + "±");
      }
    }
    return cols;
  }, [maps]);

  const { getWidth, getResizeHandlers, isResizing } = useColumnResize(columns);

  if (!itemSchedules.length) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-sm text-slate-400">
        No matched items found
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-white px-5 py-3 text-primary flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10">
            <svg className="size-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12c-.621 0-1.125.504-1.125 1.125M12 12c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M12 15.375c-.621 0-1.125-.504-1.125-1.125v-1.5" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-primary tracking-wide">
              Matched Items
            </p>
            <p className="text-[11px]">
              {itemSchedules.length} item{itemSchedules.length !== 1 ? "s" : ""} matched
            </p>
          </div>
        </div>
        <Badge className="bg-white/10 border-white/20 text-[10px] hover:bg-white/20">
          {itemSchedules.length} Records
        </Badge>
      </div>

      <div
        className={cn(
          "overflow-auto max-h-[65vh]",
          isResizing && "select-none",
        )}
      >
        <table
          className="w-full border-collapse text-sm"
          style={{ tableLayout: "fixed" }}
        >
          <thead className="sticky top-0 h-[52px] z-20">
            <tr className="h-[52px]">
              {columns.map((col) => (
                  <th
                    key={col}
                    className={cn(
                      "bg-[#0f2847] h-[52px] text-white text-[11px] font-semibold overflow-hidden uppercase tracking-wider",
                      "px-3 py-2.5 text-left border-b border-[#1a3a63]",
                      "whitespace-normal break-words relative group",
                      (col === "itemCode" || col === "itemScheduleName") && "sticky z-30 bg-[#0f2847]",
                      col === "itemCode" && "left-0",
                    )}
                    style={{
                      width: getWidth(col),
                      minWidth: getWidth(col),
                      maxWidth: getWidth(col),
                      left: col === "itemScheduleName" ? getWidth("itemCode") : undefined,
                    }}
                  >
                  {col === "itemCode"
                    ? "Item Code"
                    : col === "itemScheduleName"
                      ? "Item Name"
                      : col.endsWith("±")
                        ? formatHeaderLabel(col.slice(0, -1)) + " ±"
                        : formatHeaderLabel(col)}

                  {col !== "itemCode" && col !== "itemScheduleName" && (
                    <div
                      className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize group-hover:bg-blue-300/50 active:bg-blue-400/70 rounded-full"
                      onPointerDown={getResizeHandlers(col).onPointerDown}
                    />
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {itemSchedules.map((item, i) => (
              <tr
                key={item.id}
                className={cn(
                  "border-b border-slate-100 transition-colors h-[52px]",
                  "hover:bg-blue-50/40",
                  i % 2 === 0 ? "bg-white" : "bg-slate-50/50",
                )}
              >
                {columns.map((col) => {
                  if (col === "itemCode" || col === "itemScheduleName") {
                    return (
                      <td
                        key={col}
                        className={cn(
                          "px-3 py-0 text-xs text-slate-600",
                          "whitespace-normal break-words leading-relaxed overflow-hidden h-[52px]",
                          "sticky z-10 align-middle",
                          col === "itemCode" && "left-0",
                          i % 2 === 0 ? "bg-white" : "bg-slate-50/50",
                        )}
                        style={{
                          width: getWidth(col),
                          minWidth: getWidth(col),
                          maxWidth: getWidth(col),
                          wordBreak: "break-word",
                          left: col === "itemScheduleName" ? getWidth("itemCode") : undefined,
                        }}
                      >
                        <div className="max-h-[100px] overflow-y-auto py-1.5 whitespace-normal break-words">
                          {col === "itemCode" ? (item.itemCode || "—") : (item.itemScheduleName || "—")}
                        </div>
                      </td>
                    );
                  }

                  const isPlusMinus = col.endsWith("±");
                  const fieldName = isPlusMinus ? col.slice(0, -1) : col;
                  const value = item[fieldName] as string | null;
                  const plusMinusValue = item[fieldName + "PlusMinus"] as string | null;

                  return (
                    <td
                      key={col}
                      className={cn(
                        "px-3 py-0 text-xs text-slate-600",
                        "whitespace-normal break-words leading-relaxed overflow-hidden h-[52px]",
                      )}
                      style={{
                        width: getWidth(col),
                        minWidth: getWidth(col),
                        maxWidth: getWidth(col),
                        wordBreak: "break-word",
                      }}
                    >
                      {isPlusMinus ? (
                        plusMinusValue ? (
                          <Badge
                            className={cn(
                              "text-[10px] font-medium border-0",
                              outputBadgeColor[plusMinusValue] ?? "",
                            )}
                          >
                            {outputDisplayLabel[plusMinusValue] ?? plusMinusValue}
                          </Badge>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )
                      ) : (
                        <div className="max-h-[100px] overflow-y-auto py-1.5 whitespace-normal break-words">
                          {value || "—"}
                        </div>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
