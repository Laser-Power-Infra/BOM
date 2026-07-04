"use client";

import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { useColumnResize } from "@/hooks/use-column-resize";

interface TenderTableProps {
  columns: string[];
  rows: Record<string, string>[];
  fileName: string;
}

export default function TenderTable({
  columns,
  rows,
  fileName,
}: TenderTableProps) {
  const { getWidth, getResizeHandlers, isResizing } = useColumnResize(columns);

  if (!rows.length) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-slate-200 bg-white p-12 text-sm text-slate-400">
        No tenders found for {fileName}
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      {/* Table Info Bar */}
      <div className="bg-white px-5 py-3 text-primary flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10">
            <svg
              className="size-3.5 "
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.5}
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M3.375 19.5h17.25m-17.25 0a1.125 1.125 0 0 1-1.125-1.125M3.375 19.5h7.5c.621 0 1.125-.504 1.125-1.125m-9.75 0V5.625m0 12.75v-1.5c0-.621.504-1.125 1.125-1.125m18.375 2.625V5.625m0 12.75c0 .621-.504 1.125-1.125 1.125m1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125m0 3.75h-7.5A1.125 1.125 0 0 1 12 18.375m9.75-12.75c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125m19.5 0v1.5c0 .621-.504 1.125-1.125 1.125M2.25 5.625v1.5c0 .621.504 1.125 1.125 1.125m0 0h17.25m-17.25 0h7.5c.621 0 1.125.504 1.125 1.125M3.375 8.25c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125m17.25-3.75h-7.5c-.621 0-1.125.504-1.125 1.125m8.625-1.125c.621 0 1.125.504 1.125 1.125v1.5c0 .621-.504 1.125-1.125 1.125m-17.25 0h7.5m-7.5 0c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125M12 10.875v-1.5m0 1.5c0 .621-.504 1.125-1.125 1.125M12 10.875c0 .621.504 1.125 1.125 1.125m-2.25 0c.621 0 1.125.504 1.125 1.125M10.875 12c-.621 0-1.125.504-1.125 1.125M12 12c.621 0 1.125.504 1.125 1.125m0 0v1.5c0 .621-.504 1.125-1.125 1.125M12 15.375c-.621 0-1.125-.504-1.125-1.125v-1.5"
              />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-primary tracking-wide">
              {fileName}
            </p>
            <p className="text-[11px] ">
              {rows.length} tender{rows.length !== 1 ? "s" : ""} found
            </p>
          </div>
        </div>
        <Badge className="bg-white/10  border-white/20 text-[10px] hover:bg-white/20">
          {rows.length} Records
        </Badge>
      </div>

      {/* Table with horizontal scroll and vertical scroll */}
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
          {/* Deep blue sticky header */}
          <thead className="sticky top-0 h-[52px] z-20">
            <tr className="h-[52px]">
              {columns.map((col) => (
                <th
                  key={col}
                  className={cn(
                    "bg-[#0f2847] h-[52px] text-white text-[11px] font-semibold overflow-hidden uppercase tracking-wider",
                    "px-3 py-2.5 text-left border-b border-[#1a3a63]",
                    "whitespace-normal break-words relative group",
                    col === "type" && "sticky left-0 z-30 bg-[#0f2847]",
                  )}
                  style={{
                    width: getWidth(col),
                    minWidth: getWidth(col),
                    maxWidth: getWidth(col),
                  }}
                >
                  {col === "type"
                    ? "Type"
                    : col.toLowerCase() === "t247 id"
                      ? "PORTAL ID"
                      : col.replace(/([A-Z])/g, " $1").trim()}

                  {/* Resize handle */}
                  {col !== "type" && (
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
            {rows.map((row, i) => (
              <tr
                key={i}
                className={cn(
                  "border-b border-slate-100 transition-colors h-[52px]",
                  "hover:bg-blue-50/40",
                  i % 2 === 0 ? "bg-white" : "bg-slate-50/50",
                )}
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    className={cn(
                      "px-3 py-0 text-xs text-slate-600",
                      "whitespace-normal break-words leading-relaxed overflow-hidden h-[52px]",
                      col === "type" && "sticky left-0 z-10 align-middle",
                      col === "type" &&
                        (i % 2 === 0 ? "bg-white" : "bg-slate-50/50"),
                    )}
                    style={{
                      width: getWidth(col),
                      minWidth: getWidth(col),
                      maxWidth: getWidth(col),
                      wordBreak: "break-word",
                    }}
                  >
                    {col === "type" ? (
                      <Badge
                        variant={row.type === "Gem" ? "default" : "secondary"}
                        className={cn(
                          "text-[10px] font-medium",
                          row.type === "Gem"
                            ? "bg-blue-600 text-white hover:bg-blue-700"
                            : "bg-slate-100 text-slate-600 border-slate-200",
                        )}
                      >
                        {row.type}
                      </Badge>
                    ) : (
                      <div className="max-h-[100px] overflow-y-auto py-1.5 whitespace-normal break-words">
                        {row[col] || "—"}
                      </div>
                    )}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
