"use client";

import { useState, useRef, useCallback } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { cn } from "@/lib/utils";

interface SheetResult {
  sheetName: string;
  gemCount: number;
  nonGemCount: number;
  excludedCount: number;
  errors: string[];
  skipped: boolean;
}

interface FileResult {
  fileName: string;
  fileId: number;
  sheets: SheetResult[];
  totalGem: number;
  totalNonGem: number;
  totalErrors: string[];
  totalCount: number;
  excludedCount: number;
}

interface UploadResponse {
  success: boolean;
  results: FileResult[];
  error?: string;
}

function UploadIcon() {
  return (
    <svg className="size-4" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="size-3" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
    </svg>
  );
}

function Spinner() {
  return (
    <svg className="size-4 animate-spin" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
    </svg>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

export default function FileUpload() {
  const [files, setFiles] = useState<File[]>([]);
  const [parsing, setParsing] = useState(false);
  const [results, setResults] = useState<FileResult[] | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const addFiles = useCallback((newFiles: FileList | File[]) => {
    const validFiles = Array.from(newFiles).filter(
      (f) =>
        f.name.endsWith(".xlsx") ||
        f.name.endsWith(".xls") ||
        f.type.includes("spreadsheet") ||
        f.type.includes("excel")
    );

    const invalidCount = Array.from(newFiles).length - validFiles.length;
    if (invalidCount > 0) {
      toast.error(`${invalidCount} file(s) skipped — only .xlsx/.xls allowed`);
    }

    setFiles((prev) => {
      const existing = new Set(prev.map((f) => f.name + f.size));
      const unique = validFiles.filter((f) => !existing.has(f.name + f.size));
      return [...prev, ...unique];
    });
  }, []);

  const removeFile = useCallback((index: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const handleUploadClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files?.length) {
        addFiles(e.target.files);
        e.target.value = "";
      }
    },
    [addFiles]
  );

  const handleParse = useCallback(async () => {
    if (!files.length) return;

    setParsing(true);
    setResults(null);
    const accumulated: FileResult[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const label = `Processing file ${i + 1}/${files.length}: ${file.name}`;

      const loadingToast = toast.loading(label);

      try {
        const formData = new FormData();
        formData.append("files", file);

        const res = await fetch("/api/upload", {
          method: "POST",
          body: formData,
        });

        const data: UploadResponse = await res.json();

        if (!res.ok) {
          toast.dismiss(loadingToast);
          toast.error(`${file.name} failed`, {
            description: data.error || "Upload error",
          });
          continue;
        }

        const fileResult = data.results[0];
        accumulated.push(fileResult);

        toast.dismiss(loadingToast);
        toast.success(`${file.name} done`, {
          description: `${fileResult.totalGem} GEM · ${fileResult.totalNonGem} Non-GEM · ${fileResult.excludedCount} excluded${fileResult.totalErrors.length ? ` · ${fileResult.totalErrors.length} error(s)` : ""}`,
        });
      } catch {
        toast.dismiss(loadingToast);
        toast.error(`${file.name} failed`, {
          description: "Network error. Please try again.",
        });
      }
    }

    setResults(accumulated);
    setFiles([]);
    setParsing(false);
  }, [files]);

  const totalRows = results
    ? results.reduce((s, r) => s + r.totalGem + r.totalNonGem, 0)
    : 0;
  const totalExcluded = results
    ? results.reduce((s, r) => s + r.excludedCount, 0)
    : 0;

  return (
    <div className="h-full flex flex-col space-y-4">
      <div className="flex-1 flex flex-col rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
        {/* Deep blue header */}
        <div className="bg-gradient-to-r from-[#0a1e3d] to-[#13305f] px-5 py-3.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="flex items-center justify-center w-7 h-7 rounded-lg bg-white/10">
              <UploadIcon />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-white tracking-wide">
                Upload Tenders
              </h3>
              <p className="text-[11px] text-blue-200/70">
                Excel files (.xlsx, .xls)
              </p>
            </div>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={handleUploadClick}
            disabled={parsing}
            className="text-white hover:bg-white/10 hover:text-white border border-white/20 text-xs h-8 px-3 rounded-lg transition-all"
          >
            <UploadIcon />
            <span className="ml-1.5">Browse</span>
          </Button>
        </div>

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".xlsx,.xls"
          className="sr-only"
          onChange={handleInputChange}
        />

        {/* Body */}
        <div className="flex-1 flex flex-col p-5">
          {files.length === 0 && !results && (
            <div
              className="flex-1 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-lg p-6 cursor-pointer hover:border-blue-300 hover:bg-blue-50/20 transition-all"
              onClick={handleUploadClick}
            >
              <div className="w-10 h-10 rounded-full bg-blue-50 flex items-center justify-center mb-3">
                <svg className="size-5 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0 3 3m-3-3-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                </svg>
              </div>
              <p className="text-xs text-slate-500 text-center">
                Click to browse or drag files here
              </p>
              <p className="text-[10px] text-slate-400 mt-0.5">
                .xlsx and .xls files supported
              </p>
            </div>
          )}

          {/* File pills */}
          {files.length > 0 && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {files.map((file, i) => (
                  <Badge
                    key={file.name + file.size}
                    variant="secondary"
                    className="inline-flex items-center gap-1.5 py-1.5 pr-1 pl-2.5 text-xs font-normal max-w-full rounded-lg bg-slate-100 text-slate-700 border border-slate-200"
                  >
                    <span className="truncate">{file.name}</span>
                    <span className="shrink-0 text-[10px] text-slate-400">
                      {formatFileSize(file.size)}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(i)}
                      className="flex shrink-0 items-center justify-center rounded-md p-0.5 text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors ml-0.5"
                      aria-label={`Remove ${file.name}`}
                    >
                      <XIcon />
                    </button>
                  </Badge>
                ))}
              </div>

              <Button
                size="sm"
                onClick={handleParse}
                disabled={parsing}
                className="bg-blue-600 hover:bg-blue-700 text-white rounded-lg h-9 px-5 text-xs font-medium transition-all shadow-sm"
              >
                {parsing ? (
                  <>
                    <Spinner />
                    <span className="ml-1.5">Parsing...</span>
                  </>
                ) : (
                  `Parse ${files.length} File${files.length !== 1 ? "s" : ""}`
                )}
              </Button>
            </div>
          )}
        </div>
      </div>

      {/* Results Card */}
      {results && results.length > 0 && (
        <div className="rounded-xl bg-white border border-slate-200 shadow-sm overflow-hidden">
          <div className="bg-gradient-to-r from-emerald-600 to-emerald-700 px-5 py-3">
            <h4 className="text-sm font-semibold text-white">
              Results — {totalRows} inserted
              {totalExcluded > 0 ? `, ${totalExcluded} excluded` : ""} across{" "}
              {results.length} file{results.length !== 1 ? "s" : ""}
            </h4>
          </div>

          <div className="p-4 space-y-3">
            {results.map((fileResult) => (
              <div
                key={fileResult.fileId}
                className="rounded-lg border border-slate-200 overflow-hidden"
              >
                <div className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 bg-slate-50">
                  <span className="text-sm font-medium text-slate-700">
                    {fileResult.fileName}
                  </span>
                  <div className="flex items-center gap-2">
                    <Badge
                      variant="secondary"
                      className="text-[10px] bg-blue-50 text-blue-700 border-blue-100"
                    >
                      {fileResult.totalGem} GEM
                    </Badge>
                    <Badge
                      variant="outline"
                      className="text-[10px] border-slate-200"
                    >
                      {fileResult.totalNonGem} Non-GEM
                    </Badge>
                    {fileResult.excludedCount > 0 && (
                      <Badge
                        variant="outline"
                        className="text-[10px] text-slate-400 border-slate-200"
                      >
                        {fileResult.excludedCount} excluded
                      </Badge>
                    )}
                  </div>
                </div>
                {fileResult.sheets.length > 0 && (
                  <div className="border-t border-slate-100">
                    <Table>
                      <TableHeader>
                        <TableRow className="bg-slate-50 hover:bg-slate-50">
                          <TableHead className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold h-8">
                            Sheet
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold h-8">
                            Status
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold h-8">
                            GEM
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold h-8">
                            Non-GEM
                          </TableHead>
                          <TableHead className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold h-8">
                            Errors
                          </TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {fileResult.sheets.map((sheet) => (
                          <TableRow key={sheet.sheetName}>
                            <TableCell className="font-medium text-xs text-slate-700">
                              {sheet.sheetName}
                            </TableCell>
                            <TableCell>
                              {sheet.skipped ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] text-amber-600 border-amber-200 bg-amber-50"
                                >
                                  Skipped
                                </Badge>
                              ) : (
                                <Badge
                                  variant="default"
                                  className="bg-emerald-600 text-[10px]"
                                >
                                  Processed
                                </Badge>
                              )}
                            </TableCell>
                            <TableCell className="text-xs">
                              {sheet.gemCount}
                            </TableCell>
                            <TableCell className="text-xs">
                              {sheet.nonGemCount}
                            </TableCell>
                            <TableCell>
                              {sheet.errors.length > 0 ? (
                                <span className="text-red-500 text-xs font-medium">
                                  {sheet.errors.length}
                                </span>
                              ) : (
                                <span className="text-emerald-500 text-xs">
                                  OK
                                </span>
                              )}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
                {fileResult.totalErrors.length > 0 && (
                  <div className="border-t border-slate-100 px-4 py-3 bg-red-50/50">
                    <p className="text-[10px] font-semibold text-red-600 mb-1 uppercase tracking-wider">
                      Errors
                    </p>
                    <ScrollArea className="max-h-20">
                      <div className="space-y-0.5">
                        {fileResult.totalErrors.map((err, i) => (
                          <p key={i} className="text-xs text-red-500/80">
                            • {err}
                          </p>
                        ))}
                      </div>
                    </ScrollArea>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
