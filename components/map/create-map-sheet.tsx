"use client"

import { useState } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import { PlusIcon, Trash2Icon } from "lucide-react"

const OUTPUT_FIELDS = [
  "cuTape",
  "alCu",
  "alloy",
  "armour",
  "semicon",
  "insulation",
  "pvcInner",
  "pvcOuter",
  "filler",
  "polyt",
  "spclConstruction",
] as const

const RULE_OPERATORS = ["gt", "lt", "eq"] as const

const RULE_OUTPUTS = [
  "PLUS_PLUS",
  "PLUS",
  "ZERO",
  "MINUS",
  "MINUS_MINUS",
] as const

interface RuleEntry {
  label: string
  value: string
  operator: string
  output: string
}

interface CreateMapSheetProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onCreated?: () => void
}

export function CreateMapSheet({ open, onOpenChange, onCreated }: CreateMapSheetProps) {
  const [mapA, setMapA] = useState("")
  const [mapB, setMapB] = useState("")
  const [output, setOutput] = useState("")
  const [rules, setRules] = useState<RuleEntry[]>([])
  const [saving, setSaving] = useState(false)

  function addRule() {
    setRules([...rules, { label: "", value: "", operator: "gt", output: "ZERO" }])
  }

  function removeRule(index: number) {
    setRules(rules.filter((_, i) => i !== index))
  }

  function updateRule(index: number, field: keyof RuleEntry, value: string) {
    setRules(rules.map((r, i) => (i === index ? { ...r, [field]: value } : r)))
  }

  async function handleSave() {
    if (!mapA || !mapB || !output) {
      toast.error("Map A, Map B, and Output are required")
      return
    }

    setSaving(true)
    try {
      const res = await fetch("/api/maps", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mapA, mapB, output, rules: rules.filter((r) => r.label && r.value) }),
      })

      if (!res.ok) {
        const err = await res.json()
        throw new Error(err.error || "Failed to save")
      }

      toast.success("Mapping created")
      setMapA("")
      setMapB("")
      setOutput("")
      setRules([])
      onOpenChange(false)
      onCreated?.()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to save")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full sm:max-w-lg">
        <SheetHeader>
          <SheetTitle>Create Mapping</SheetTitle>
          <SheetDescription>
            Define a column mapping and its threshold rules.
          </SheetDescription>
        </SheetHeader>

        <div className="flex flex-col gap-4 px-4 py-2 overflow-y-auto flex-1">
          {/* Map A */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapA">Map A</Label>
            <Input
              id="mapA"
              value={mapA}
              onChange={(e) => setMapA(e.target.value)}
              placeholder="Column name in File A"
            />
          </div>

          {/* Map B */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="mapB">Map B</Label>
            <Input
              id="mapB"
              value={mapB}
              onChange={(e) => setMapB(e.target.value)}
              placeholder="Column name in File B"
            />
          </div>

          {/* Output */}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="output">Output Field</Label>
            <Select value={output} onValueChange={setOutput}>
              <SelectTrigger id="output" className="w-full">
                <SelectValue placeholder="Select output field" />
              </SelectTrigger>
              <SelectContent>
                {OUTPUT_FIELDS.map((f) => (
                  <SelectItem key={f} value={f}>
                    {f}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Separator />

          {/* Rules */}
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium">Rules</span>
            <Button variant="outline" size="xs" onClick={addRule}>
              <PlusIcon />
              Add Rule
            </Button>
          </div>

          {rules.length === 0 && (
            <p className="text-xs text-muted-foreground text-center py-4">
              No rules added yet. Click "Add Rule" to create one.
            </p>
          )}

          {rules.map((rule, i) => (
            <div key={i} className="rounded-lg border p-3 space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">Rule {i + 1}</span>
                <Button
                  variant="ghost"
                  size="icon-xs"
                  onClick={() => removeRule(i)}
                >
                  <Trash2Icon className="size-3" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Label</Label>
                  <Input
                    value={rule.label}
                    onChange={(e) => updateRule(i, "label", e.target.value)}
                    placeholder="e.g. gt 5%"
                  />
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Value</Label>
                  <Input
                    value={rule.value}
                    onChange={(e) => updateRule(i, "value", e.target.value)}
                    placeholder="e.g. 5"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Operator</Label>
                  <Select
                    value={rule.operator}
                    onValueChange={(v) => updateRule(i, "operator", v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_OPERATORS.map((op) => (
                        <SelectItem key={op} value={op}>
                          {op}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-col gap-1">
                  <Label className="text-xs">Output</Label>
                  <Select
                    value={rule.output}
                    onValueChange={(v) => updateRule(i, "output", v)}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {RULE_OUTPUTS.map((ro) => (
                        <SelectItem key={ro} value={ro}>
                          {ro}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </div>
          ))}
        </div>

        <SheetFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? "Saving..." : "Save Mapping"}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  )
}
