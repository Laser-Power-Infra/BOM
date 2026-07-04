"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog"
import { Badge } from "@/components/ui/badge"
import {
  Table,
  TableHeader,
  TableRow,
  TableHead,
  TableBody,
  TableCell,
} from "@/components/ui/table"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Input } from "@/components/ui/input"
import { Separator } from "@/components/ui/separator"
import { Loader2Icon, SearchIcon } from "lucide-react"

interface Rule {
  id: number
  label: string
  value: string
  operator: string
  output: string
}

interface MapItem {
  id: number
  mapA: string
  mapB: string
  output: string
  Rules: Rule[]
  createdAt: string
}

const outputBadgeColor: Record<string, string> = {
  PLUS_PLUS: "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400",
  PLUS: "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400",
  ZERO: "bg-slate-100 text-slate-600 dark:bg-slate-800/30 dark:text-slate-400",
  MINUS: "bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400",
  MINUS_MINUS: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400",
}

interface ViewMapsDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function ViewMapsDialog({ open, onOpenChange }: ViewMapsDialogProps) {
  const [maps, setMaps] = useState<MapItem[]>([])
  const [loading, setLoading] = useState(false)
  const [search, setSearch] = useState("")
  const [filterOutput, setFilterOutput] = useState("")

  useEffect(() => {
    if (!open) return
    setLoading(true)
    fetch("/api/maps")
      .then((res) => res.json())
      .then((data) => setMaps(data.maps ?? []))
      .catch(() => setMaps([]))
      .finally(() => setLoading(false))
  }, [open])

  const filtered = maps.filter((m) => {
    if (search && !m.mapA.toLowerCase().includes(search.toLowerCase()) && !m.mapB.toLowerCase().includes(search.toLowerCase())) {
      return false
    }
    if (filterOutput && m.output !== filterOutput) return false
    return true
  })

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>Mappings</DialogTitle>
          <DialogDescription>
            All defined column mappings and their threshold rules.
          </DialogDescription>
        </DialogHeader>

        <div className="flex items-center gap-2 px-1">
          <div className="relative flex-1">
            <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <Input
              placeholder="Search maps..."
              className="pl-8"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Select value={filterOutput} onValueChange={setFilterOutput}>
            <SelectTrigger className="w-40">
              <SelectValue placeholder="All fields" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value=" ">All fields</SelectItem>
              <SelectItem value="cuTape">cuTape</SelectItem>
              <SelectItem value="alCu">alCu</SelectItem>
              <SelectItem value="alloy">alloy</SelectItem>
              <SelectItem value="armour">armour</SelectItem>
              <SelectItem value="semicon">semicon</SelectItem>
              <SelectItem value="insulation">insulation</SelectItem>
              <SelectItem value="pvcInner">pvcInner</SelectItem>
              <SelectItem value="pvcOuter">pvcOuter</SelectItem>
              <SelectItem value="filler">filler</SelectItem>
              <SelectItem value="polyt">polyt</SelectItem>
              <SelectItem value="spclConstruction">spclConstruction</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2Icon className="size-6 animate-spin text-muted-foreground" />
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-12">
              {maps.length === 0 ? "No mappings found." : "No mappings match your search."}
            </p>
          ) : (
            <div className="space-y-4">
              {filtered.map((m) => (
                <div key={m.id} className="rounded-lg border p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <span className="text-sm font-medium">{m.mapA}</span>
                      <span className="text-xs text-muted-foreground mx-1.5">→</span>
                      <span className="text-sm font-medium">{m.mapB}</span>
                    </div>
                    <Badge variant="outline">{m.output}</Badge>
                  </div>
                  <Separator className="mb-2" />
                  {m.Rules.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No rules</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Label</TableHead>
                          <TableHead>Value</TableHead>
                          <TableHead>Operator</TableHead>
                          <TableHead>Output</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {m.Rules.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium">{r.label}</TableCell>
                            <TableCell>{r.value}</TableCell>
                            <TableCell>
                              <Badge variant="secondary" className="font-mono text-xs">
                                {r.operator}
                              </Badge>
                            </TableCell>
                            <TableCell>
                              <Badge className={outputBadgeColor[r.output] ?? ""}>
                                {r.output}
                              </Badge>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}
