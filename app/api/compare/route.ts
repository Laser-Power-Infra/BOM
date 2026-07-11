import { prisma } from "@/lib/prisma";
import { fetchBothSheets } from "@/lib/google-sheets";
import pLimit from "p-limit";

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

    const itemNameHeader = "Item Level 3 Name";
    const itemNameColB = sheetB.headers.indexOf(itemNameHeader);

    const itemSchedules: Record<string, Record<string, string | null>> = {};

    for (const code of matched) {
      const rowA = lookupA.get(code)!;
      const rowB = lookupB.get(code)!;
      const itemName =
        itemNameColB >= 0 ? String(rowB[itemNameColB] ?? "").trim() : "";
      const itemData: Record<string, string | null> = {
        itemCode: code,
        itemScheduleName: itemName,
      };

      const outputsPopulated = new Set<string>();

      const log = (msg: string) => {
        if (code === "FA1600014") console.log(msg);
      };

      for (const map of maps) {
        if (!VALID_OUTPUT_FIELDS.has(map.output)) continue;

        log(
          `\n[COMPARE] Item: ${code} | Map: "${map.mapA}" -> "${map.mapB}" -> ${map.output}`,
        );

        if (outputsPopulated.has(map.output)) {
          log(
            `  → SKIP: output "${map.output}" already populated by earlier map`,
          );
          continue;
        }

        const colA = sheetA.headers.indexOf(map.mapA);
        const colB = sheetB.headers.indexOf(map.mapB);
        log(
          `  Header lookup: colA index=${colA} (header="${map.mapA}"), colB index=${colB} (header="${map.mapB}")`,
        );

        if (colA < 0 || colB < 0) {
          log(`  → SKIP: header not found in sheet`);
          continue;
        }

        const rawA = colA < rowA.length ? rowA[colA] : null;
        const rawB = colB < rowB.length ? rowB[colB] : null;
        log(`  Raw values: A="${rawA}", B="${rawB}"`);

        const valA = parseNumeric(rawA);
        const valB = parseNumeric(rawB);
        log(`  Parsed: valA=${valA}, valB=${valB}`);

        if (valA === null || valB === null) {
          log(`  → SKIP: non-numeric value in sheet A or B`);
          continue;
        }

        log(`  → MAP WINS: storing mapA header "${map.mapA}" in ${map.output}`);
        itemData[map.output] = map.mapA;
        outputsPopulated.add(map.output);

        const diff =
          valA !== 0 ? ((valB - valA) / valA) * 100 : valB !== 0 ? Infinity : 0;
        log(`  Diff: ${diff} (A=${valA}, B=${valB})`);

        if (diff === null) {
          log(`  → SKIP PlusMinus: diff is null`);
          itemData[map.output + "PlusMinus"] = null;
          itemData[map.output + "Diff"] = null;
          continue;
        }

        const diffStr = isFinite(diff)
          ? diff.toFixed(2) + "%"
          : diff === Infinity
            ? "+Inf"
            : "-Inf";
        if (map.output !== "finalOutput") {
          itemData[map.output + "Diff"] = diffStr;
        }

        log(`  Item name from MRP: "${itemName}"`);

        const applicableRules = itemName
          ? map.Rules.filter((r) => !r.category || r.category === itemName)
          : map.Rules.filter((r) => !r.category);

        log(
          `  Rules: ${map.Rules.length} total, ${applicableRules.length} applicable${itemName ? ` (filtered by category="${itemName}")` : ""}`,
        );
        applicableRules.forEach((r, i) => {
          log(
            `    [${i}] ${r.operator} ${r.value} (category="${r.category || "global"}") -> ${r.output}`,
          );
        });

        let matchedOutput: string | null = null;
        for (const rule of applicableRules) {
          const threshold = parseFloat(rule.value);
          if (!isFinite(threshold)) {
            log(
              `    → Rule ${rule.operator} ${rule.value}: threshold not finite, skipping`,
            );
            continue;
          }

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

          log(
            `    → Rule ${rule.operator} ${rule.value}: diff=${diff}, threshold=${threshold}, matches=${matches}`,
          );

          if (matches) {
            matchedOutput = rule.output;
            log(`    → MATCHED: ${rule.output} (${rule.label})`);
            break;
          }
        }

        if (matchedOutput === null) {
          log(`  → NO RULE MATCHED for this map`);
        }

        itemData[map.output + "PlusMinus"] = matchedOutput;
      }

      itemSchedules[code] = itemData;
    }

    const upsertPayloads = Object.values(itemSchedules).map((d) => ({
      itemCode: d.itemCode ?? "",
      itemScheduleName: d.itemScheduleName ?? "",
      bomType: d.bomType ?? null,
      option2: d.option2 ?? null,
      option2Diff: d.option2Diff ?? null,
      ccvSioplas: d.ccvSioplas ?? null,
      ccvSioplasDiff: d.ccvSioplasDiff ?? null,
      cuTape: d.cuTape ?? null,
      cuTapePlusMinus: d.cuTapePlusMinus ?? null,
      cuTapeDiff: d.cuTapeDiff ?? null,
      alCu: d.alCu ?? null,
      alCuPlusMinus: d.alCuPlusMinus ?? null,
      alCuDiff: d.alCuDiff ?? null,
      alloy: d.alloy ?? null,
      alloyPlusMinus: d.alloyPlusMinus ?? null,
      alloyDiff: d.alloyDiff ?? null,
      armour: d.armour ?? null,
      armourPlusMinus: d.armourPlusMinus ?? null,
      armourDiff: d.armourDiff ?? null,
      semicon: d.semicon ?? null,
      semiconPlusMinus: d.semiconPlusMinus ?? null,
      semiconDiff: d.semiconDiff ?? null,
      insulation: d.insulation ?? null,
      insulationPlusMinus: d.insulationPlusMinus ?? null,
      insulationDiff: d.insulationDiff ?? null,
      pvcInner: d.pvcInner ?? null,
      pvcInnerPlusMinus: d.pvcInnerPlusMinus ?? null,
      pvcInnerDiff: d.pvcInnerDiff ?? null,
      pvcOuter: d.pvcOuter ?? null,
      pvcOuterPlusMinus: d.pvcOuterPlusMinus ?? null,
      pvcOuterDiff: d.pvcOuterDiff ?? null,
      filler: d.filler ?? null,
      fillerPlusMinus: d.fillerPlusMinus ?? null,
      fillerDiff: d.fillerDiff ?? null,
      polyt: d.polyt ?? null,
      polytPlusMinus: d.polytPlusMinus ?? null,
      polytDiff: d.polytDiff ?? null,
      spclConstruction: d.spclConstruction ?? null,
      spclConstructionPlusMinus: d.spclConstructionPlusMinus ?? null,
      spclConstructionDiff: d.spclConstructionDiff ?? null,
      finalOutput: d.finalOutput ?? null,
    }));

    const limit = pLimit(8);

    const upserted = await Promise.all(
      upsertPayloads.map((item) =>
        limit(() =>
          prisma.itemSchedule.upsert({
            where: { itemCode: item.itemCode },
            create: item,
            update: item,
          }),
        ),
      ),
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
