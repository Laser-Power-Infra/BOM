"use client";

import { useState } from "react";
import GoogleSheetUpload from "@/components/upload/google-sheet-upload";
import { Button } from "@/components/ui/button";
import { CreateMapSheet } from "@/components/map/create-map-sheet";
import { ViewMapsDialog } from "@/components/map/view-maps-dialog";

export default function Home() {
  const [createOpen, setCreateOpen] = useState(false);
  const [viewOpen, setViewOpen] = useState(false);

  return (
    <div className="flex flex-col flex-1 min-h-screen bg-zinc-50 font-sans">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold text-slate-900">BOM Comparison</h1>
          <p className="text-sm text-slate-500">
            Google Sheets · NON CHAIN BOM vs MRP/IS
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setViewOpen(true)}>
            View Mappings
          </Button>
          <Button onClick={() => setCreateOpen(true)}>
            Create Mapping
          </Button>
        </div>
      </header>
      <main className="flex-1 px-8 py-6 w-full">
        <GoogleSheetUpload />
      </main>
      <CreateMapSheet
        open={createOpen}
        onOpenChange={setCreateOpen}
      />
      <ViewMapsDialog
        open={viewOpen}
        onOpenChange={setViewOpen}
      />
    </div>
  );
}
