import { prisma } from "@/lib/prisma";
import { fetchBothSheets } from "@/lib/google-sheets";
import { columnLetterToIndex } from "@/lib/column-utils";

const VALID_OUTPUT_FIELDS = new Set([
  "option2",
  "ccvSioplas",
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
  "finalOutput",
]);

function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "number") return isFinite(value) ? value : null;
  if (typeof value === "string") {
    const cleaned = value
      .replace(/[,$%\s]/g, "")
      .replace(/mm|cm|m|kg|g|lb/gi, "")
      .trim();
    if (cleaned === "") return null;
    const parsed = parseFloat(cleaned);
    return isFinite(parsed) ? parsed : null;
  }
  return null;
}

export async function POST() {
  try {
    const { sheetA, sheetB } = await fetchBothSheets();

    const maps = await prisma.map.findMany({
      include: { Rules: true },
      orderBy: { id: "asc" },
    });

    if (maps.length === 0) {
      return Response.json({
        success: true,
        summary: {
          totalMatched: 0,
          unmatchedInFileA: sheetA.rows.length,
          unmatchedInFileB: sheetB.rows.length,
          mapsApplied: 0,
        },
      });
    }

    const itemCodeIdxA = 0;
    const itemCodeIdxB = 2;

    const lookupA = new Map<string, unknown[]>();
    for (const row of sheetA.rows) {
      const code = String(row[itemCodeIdxA] ?? "");
      if (code) lookupA.set(code, row);
    }

    const lookupB = new Map<string, unknown[]>();
    for (const row of sheetB.rows) {
      const code = String(row[itemCodeIdxB] ?? "");
      if (code) lookupB.set(code, row);
    }

    const allCodes = new Set([...lookupA.keys(), ...lookupB.keys()]);
    const matched: string[] = [];
    const unmatchedA: string[] = [];
    const unmatchedB: string[] = [];

    for (const code of allCodes) {
      const inA = lookupA.has(code);
      const inB = lookupB.has(code);
      if (inA && inB) matched.push(code);
      else if (inA) unmatchedA.push(code);
      else unmatchedB.push(code);
    }

    const itemSchedules: Record<string, Record<string, string | null>> = {};

    for (const code of matched) {
      const rowA = lookupA.get(code)!;
      const rowB = lookupB.get(code)!;
      const itemName = String(rowB[1] ?? "");
      const itemData: Record<string, string | null> = {
        itemCode: code,
        itemScheduleName: itemName,
      };

      for (const map of maps) {
        if (!VALID_OUTPUT_FIELDS.has(map.output)) continue;

        const colA = columnLetterToIndex(map.mapA);
        const colB = columnLetterToIndex(map.mapB);

        const rawA = colA < rowA.length ? rowA[colA] : null;
        const rawB = colB < rowB.length ? rowB[colB] : null;

        const valA = parseNumeric(rawA);
        const valB = parseNumeric(rawB);

        if (valA === null || valB === null) {
          itemData[map.output] = null;
          itemData[map.output + "PlusMinus"] = null;
          continue;
        }

        const diff =
          valB !== 0
            ? ((valA - valB) / valB) * 100
            : valA !== 0
              ? Infinity
              : NaN;

        if (diff === null || (typeof diff === "number" && !isFinite(diff))) {
          itemData[map.output] = null;
          itemData[map.output + "PlusMinus"] = null;
          continue;
        }

        const diffStr = diff.toFixed(2) + "%";

        let matchedOutput: string | null = null;
        for (const rule of map.Rules) {
          const threshold = parseFloat(rule.value);
          if (!isFinite(threshold)) continue;

          let matches = false;
          switch (rule.operator) {
            case "gt":
              matches = diff > threshold;
              break;
            case "lt":
              matches = diff < threshold;
              break;
            case "eq":
              matches = diff === threshold;
              break;
          }

          if (matches) {
            matchedOutput = rule.output;
            break;
          }
        }

        itemData[map.output] = diffStr;
        itemData[map.output + "PlusMinus"] = matchedOutput;
      }

      itemSchedules[code] = itemData;
    }

    const upsertPayloads = Object.values(itemSchedules).map((d) => ({
      itemCode: d.itemCode ?? "",
      itemScheduleName: d.itemScheduleName ?? "",
      bomType: null,
      option2: d.option2,
      ccvSioplas: d.ccvSioplas,
      cuTape: d.cuTape,
      cuTapePlusMinus: d.cuTapePlusMinus,
      alCu: d.alCu,
      alCuPlusMinus: d.alCuPlusMinus,
      alloy: d.alloy,
      alloyPlusMinus: d.alloyPlusMinus,
      armour: d.armour,
      armourPlusMinus: d.armourPlusMinus,
      semicon: d.semicon,
      semiconPlusMinus: d.semiconPlusMinus,
      insulation: d.insulation,
      insulationPlusMinus: d.insulationPlusMinus,
      pvcInner: d.pvcInner,
      pvcInnerPlusMinus: d.pvcInnerPlusMinus,
      pvcOuter: d.pvcOuter,
      pvcOuterPlusMinus: d.pvcOuterPlusMinus,
      filler: d.filler,
      fillerPlusMinus: d.fillerPlusMinus,
      polyt: d.polyt,
      polytPlusMinus: d.polytPlusMinus,
      spclConstruction: d.spclConstruction,
      spclConstructionPlusMinus: d.spclConstructionPlusMinus,
      finalOutput: d.finalOutput,
    }));

    const upserted = await prisma.$transaction(
      upsertPayloads.map((item) =>
        prisma.itemSchedule.upsert({
          where: { itemCode: item.itemCode },
          create: item,
          update: item,
        }),
      ),
      {
        timeout: 100000,
      },
    );

    return Response.json({
      success: true,
      summary: {
        totalMatched: matched.length,
        unmatchedInFileA: unmatchedA.length,
        unmatchedInFileB: unmatchedB.length,
        mapsApplied: maps.length,
      },
      itemSchedules: upserted,
      maps,
      unmatchedA,
      unmatchedB,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
