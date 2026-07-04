"use client";

import { useState } from "react";
import { format } from "date-fns";
import { CalendarIcon, Eye } from "lucide-react";
import { cn } from "@/lib/utils";
import { Calendar } from "@/components/ui/calendar";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface FileItem {
  id: number;
  fileName: string;
  totalCount: number | null;
  excludedCount: number | null;
  status: string | null;
}

interface ActionAreaProps {
  files: FileItem[];
  selectedFileId: number | null;
  selectedDate: Date;
  onDateChange: (date: Date | undefined) => void;
  onFileSelect: (fileId: number | null) => void;
}

export default function ActionArea({
  files,
  selectedFileId,
  selectedDate,
  onDateChange,
  onFileSelect,
}: ActionAreaProps) {
  const [open, setOpen] = useState(false);

  const selectValue = selectedFileId?.toString() ?? "all";

  return (
    <div className="h-full flex flex-col rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
      {/* Deep blue header */}
      <div className="bg-gradient-to-r from-[#0a1e3d] to-[#13305f] px-5 py-3.5 flex items-center gap-2.5">
        <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10">
          <Eye className="size-3.5 text-blue-200" />
        </div>
        <div>
          <h3 className="text-sm font-semibold text-white tracking-wide">
            View Tenders
          </h3>
          <p className="text-[11px] text-blue-200/70">
            Select date and file to view parsed data
          </p>
        </div>
      </div>

      {/* Controls body */}
      <div className="flex-1 flex flex-col gap-4 p-5">
        {/* Date Picker */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            Date
          </label>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger
              className={cn(
                "flex items-center w-full h-10 px-3 rounded-md border border-slate-200 bg-white text-sm text-left font-normal",
                "hover:border-blue-300 hover:bg-blue-50/30 transition-colors cursor-pointer",
                !selectedDate && "text-muted-foreground"
              )}
            >
              <CalendarIcon className="mr-2 size-4 text-blue-500" />
              {format(selectedDate, "PPP")}
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar
                mode="single"
                selected={selectedDate}
                onSelect={(date) => {
                  onDateChange(date);
                  setOpen(false);
                }}
                autoFocus
              />
            </PopoverContent>
          </Popover>
        </div>

        {/* File Select */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-slate-500 uppercase tracking-wider">
            File
          </label>
          {files.length > 0 ? (
            <Select
              value={selectValue}
              onValueChange={(val) =>
                onFileSelect(val === "all" ? null : Number(val))
              }
            >
              <SelectTrigger
                className={cn(
                  "w-full h-10 border-slate-200 hover:border-blue-300 transition-colors",
                  selectedFileId !== null &&
                    "bg-blue-600 text-white border-blue-600 hover:bg-blue-700 hover:border-blue-700"
                )}
                aria-label="Select a file"
              >
                <SelectValue placeholder="All files" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All files</SelectItem>
                {files.map((f) => (
                  <SelectItem key={f.id} value={f.id.toString()}>
                    <span className="flex items-center gap-2">
                      {f.fileName}
                      {(f.totalCount ?? 0) > 0 && (
                        <span className="text-[10px] opacity-60">
                          {f.totalCount} rows
                        </span>
                      )}
                    </span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          ) : (
            <div className="flex items-center h-10 px-3 rounded-md border border-dashed border-slate-200 bg-slate-50">
              <p className="text-xs text-slate-400">
                No files uploaded on this date
              </p>
            </div>
          )}
        </div>

        {/* Quick stats */}
        {files.length > 0 && (
          <div className="mt-auto pt-3 border-t border-slate-100">
            <div className="flex items-center gap-2">
              <span className="inline-flex items-center gap-1.5 text-xs text-slate-500">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                {files.length} file{files.length !== 1 ? "s" : ""} available
              </span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
