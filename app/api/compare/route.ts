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

    // const itemCodeIdxA = 3;
    // const itemCodeIdxB = 0;

    // const lookupA = new Map<string, unknown[]>();
    // for (const row of sheetA.rows) {
    //   const code = String(row[itemCodeIdxA] ?? "");
    //   if (code) lookupA.set(code, row);
    // }

    // const lookupB = new Map<string, unknown[]>();
    // for (const row of sheetB.rows) {
    //   const code = String(row[itemCodeIdxB] ?? "");
    //   if (code) lookupB.set(code, row);
    // }

    // const allCodes = new Set([...lookupA.keys(), ...lookupB.keys()]);
    // const matched: string[] = [];
    // const unmatchedA: string[] = [];
    // const unmatchedB: string[] = [];

    // for (const code of allCodes) {
    //   const inA = lookupA.has(code);
    //   const inB = lookupB.has(code);
    //   if (inA && inB) matched.push(code);
    //   else if (inA) unmatchedA.push(code);
    //   else unmatchedB.push(code);
    // }

    const fgItemIdx = sheetA.headers.indexOf("FG Item");
    const bomCodeIdxA = sheetA.headers.indexOf("BOM Code");
    const itemCodeIdxB = sheetB.headers.indexOf("Item Code");
    const isBomIdIdx = sheetB.headers.indexOf("IS BOM ID");

    if (fgItemIdx < 0 || bomCodeIdxA < 0) {
      return Response.json(
        {
          success: false,
          error:
            'Required columns "FG Item" and/or "BOM Code" not found in NON CHAIN BOM sheet',
        },
        { status: 400 },
      );
    }
    if (itemCodeIdxB < 0 || isBomIdIdx < 0) {
      return Response.json(
        {
          success: false,
          error:
            'Required columns "Item Code" and/or "IS BOM ID" not found in MRP/IS sheet',
        },
        { status: 400 },
      );
    }

    const lookupA = new Map<
      string,
      { row: unknown[]; fgItem: string; bomCode: string }
    >();
    for (const row of sheetA.rows) {
      const fgItem = String(row[fgItemIdx] ?? "").trim();
      const bomCode = String(row[bomCodeIdxA] ?? "").trim();
      if (fgItem && bomCode) {
        lookupA.set(`${fgItem}|${bomCode}`, { row, fgItem, bomCode });
      }
    }

    const lookupB = new Map<
      string,
      { row: unknown[]; itemCode: string; isBomId: string }
    >();
    for (const row of sheetB.rows) {
      const itemCode = String(row[itemCodeIdxB] ?? "").trim();
      const isBomId = String(row[isBomIdIdx] ?? "").trim();
      if (itemCode && isBomId) {
        lookupB.set(`${itemCode}|${isBomId}`, { row, itemCode, isBomId });
      }
    }

    const matchedKeys = [...lookupA.keys()].filter((key) => lookupB.has(key));

    const itemNameHeader = "Item Level 3 Name";
    const itemNameColB = sheetB.headers.indexOf(itemNameHeader);

    const itemSchedules: Record<string, Record<string, string | null>> = {};

    // for (const code of matched) {
    //   const rowA = lookupA.get(code)!;
    //   const rowB = lookupB.get(code)!;
    //   const itemName =
    //     itemNameColB >= 0 ? String(rowB[itemNameColB] ?? "").trim() : "";
    //   const itemData: Record<string, string | null> = {
    //     itemCode: code,
    //     itemScheduleName: itemName,
    //   };
    for (const key of matchedKeys) {
      const entryA = lookupA.get(key)!;
      const entryB = lookupB.get(key)!;
      const rowA = entryA.row;
      const rowB = entryB.row;
      const code = entryB.itemCode;
      const itemName =
        itemNameColB >= 0 ? String(rowB[itemNameColB] ?? "").trim() : "";
      const itemData: Record<string, string | null> = {
        itemCode: code,
        itemScheduleName: itemName,
        bomId: entryB.isBomId,
      };

      const outputsPopulated = new Set<string>();

      const log = (msg: string) => {
        if (code === "FA2900060" && entryB.isBomId === "U1-C0003-3354")
          console.log("detailsss.................", msg);
        // if (entryB.isBomId === "U1-C0003-2065") console.log("detailsss.................",msg);
        // if (code === "FA1000116" && entryB.isBomId === "U1-C0003-2565")
        //   console.log("detailsss.................", msg);
        // if (entryB.isBomId === "U1-C0003-2017") console.log("detailsss.................",msg);
      };

      for (const map of maps) {
        if (!VALID_OUTPUT_FIELDS.has(map.output)) continue;

        // log(
        //   `\n[COMPARE] Item: ${code} | Map: "${map.mapA}" -> "${map.mapB}" -> ${map.output}`,
        // );

        if (outputsPopulated.has(map.output)) {
          // log(
          //   `  → SKIP: output "${map.output}" already populated by earlier map`,
          // );
          continue;
        }

        const colA = sheetA.headers.indexOf(map.mapA);
        if (colA < 0 || colA >= rowA.length) {
          continue;
        }
        const valA = parseNumeric(rowA[colA]);
        if (valA === null) {
          continue;
        }

        // mapB supports fallback via "|": "AL ALLOY|AL/CU WT." → first non-zero match wins
        let valB: number | null = null;
        for (const header of map.mapB.split("|").map(h => h.trim())) {
          const idx = sheetB.headers.indexOf(header);
          if (idx < 0 || idx >= rowB.length) continue;
          const parsed = parseNumeric(rowB[idx]);
          if (parsed !== null && parsed !== 0) {
            valB = parsed;
            break;
          }
        }
        if (valB === null) {
          continue;
        }

        // // log(`  → MAP WINS: storing mapA header "${map.mapA}" in ${map.output}`);
        itemData[map.output] = map.outputText;
        // Add after the outputsPopulated.add(map.output) on line 147:
        if (map.ccvsiovalue) {
          itemData["ccvSioplas"] = map.ccvsiovalue;
        }
        outputsPopulated.add(map.output);

        const diff =
          valB !== 0 ? ((valB - valA) / valB) * 100 : valA !== 0 ? -Infinity : 0;
        log(`  Diff: ${diff} (A=${valA}, B=${valB})`);

        if (diff === null) {
          // log(`  → SKIP PlusMinus: diff is null`);
          itemData[map.output + "PlusMinus"] = null;
          itemData[map.output + "Diff"] = null;
          continue;
        }

        let diffStr: string;
        if (!isFinite(diff)) {
          diffStr = diff === Infinity ? "+Inf" : "-Inf";
          if (valB === 0 && valA !== 0) diffStr += " (Sheet 2 value is 0)";
          else if (valB === 0 && valA === 0) diffStr = "0.00% (Both are 0)";
        } else {
          diffStr = diff.toFixed(2) + "%";
        }
        if (map.output !== "finalOutput") {
          itemData[map.output + "Diff"] = diffStr;
        }

        // log(`  Item name from MRP: "${itemName}"`);

        const applicableRules = itemName
          ? map.Rules.filter((r) => !r.category || r.category === itemName)
          : map.Rules.filter((r) => !r.category);

        // log(
        //   `  Rules: ${map.Rules.length} total, ${applicableRules.length} applicable${itemName ? ` (filtered by category="${itemName}")` : ""}`,
        // );
        applicableRules.forEach((r, i) => {
          // log(
          //   `    [${i}] ${r.operator} ${r.value} (category="${r.category || "global"}") -> ${r.output}`,
          // );
        });

        let matchedOutput: string | null = null;
        for (const rule of applicableRules) {
          const threshold = parseFloat(rule.value);
          if (!isFinite(threshold)) {
            // log(
            //   `    → Rule ${rule.operator} ${rule.value}: threshold not finite, skipping`,
            // );
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

          // log(
          //   `    → Rule ${rule.operator} ${rule.value}: diff=${diff}, threshold=${threshold}, matches=${matches}`,
          // );

          if (matches) {
            matchedOutput = rule.output;
            // log(`    → MATCHED: ${rule.output} (${rule.label})`);
            break;
          }
        }

        if (matchedOutput === null) {
          // log(`  → NO RULE MATCHED for this map`);
        }

        itemData[map.output + "PlusMinus"] = matchedOutput;
      }
      let validSumA = 0;
      let validSumB = 0;
      const seenColsA = new Set<number>();
      const seenColsB = new Set<number>();

      for (const m of maps) {
        const cA = sheetA.headers.indexOf(m.mapA);
        if (cA >= 0 && cA < rowA.length && !seenColsA.has(cA)) {
          const vA = parseNumeric(rowA[cA]);
          log(`  → MapA: ${m.mapA}, ColA: ${cA}, ValueA: ${vA}`);
          if (vA !== null) { validSumA += vA; seenColsA.add(cA); }
        }

        for (const header of m.mapB.split("|").map(h => h.trim())) {
          const idx = sheetB.headers.indexOf(header);
          if (idx >= 0 && idx < rowB.length && !seenColsB.has(idx)) {
            const vB = parseNumeric(rowB[idx]);
            log(`  → MapB: ${header}, ColB: ${idx}, ValueB: ${vB}`);
            if (vB !== null) { validSumB += vB; seenColsB.add(idx); break; }
          }
        }
      }

      // Calculate option2 difference
      if (validSumB === 0) {
        itemData["option2Diff"] = validSumA === 0
          ? null
          : "-Inf (Sheet 2 mapped sum is 0)";
      } else {
        const diff = ((validSumB - validSumA) / validSumB) * 100;

        if (Number.isFinite(diff)) {
          itemData["option2Diff"] = diff.toFixed(2) + "%";
        } else if (diff === Infinity) {
          itemData["option2Diff"] = "+Inf (Sheet 1 mapped sum is 0)";
        } else if (diff === -Infinity) {
          itemData["option2Diff"] = "-Inf (Sheet 2 mapped sum is 0)";
        }
      }

      // Decide option2 result
      itemData["option2"] =
        validSumA > validSumB
          ? "IS Tested"
          : validSumA === validSumB
            ? "IS"
            : "Normal";
      // pvcOuterInnerDiff: sum unique matched sheath columns
      const sheathOutputs = new Set(["pvcOuter", "pvcInner"]);
      let totalSheathA = 0;
      let totalSheathB = 0;
      const seenA = new Set<number>();
      const seenB = new Set<number>();

      for (const m of maps) {
        if (!sheathOutputs.has(m.output)) continue;
        const cA = sheetA.headers.indexOf(m.mapA);
        const cB = sheetB.headers.indexOf(m.mapB);
        if (cA < 0 || cB < 0 || cA >= rowA.length || cB >= rowB.length) continue;

        const vA = parseNumeric(rowA[cA]);
        const vB = parseNumeric(rowB[cB]);

        if (vA !== null && !seenA.has(cA)) { totalSheathA += vA; seenA.add(cA); }
        if (vB !== null && !seenB.has(cB)) { totalSheathB += vB; seenB.add(cB); }
      }

      if (totalSheathB === 0) {
        itemData["pvcOuterInnerDiff"] = totalSheathA === 0
          ? null
          : "-Inf (Outer+Inner sum is 0)";
      } else if (totalSheathA === 0) {
        // const diff = ((totalSheathB - 0) / totalSheathB) * 100;
        itemData["pvcOuterInnerDiff"] = null;
      } else {
        const diff = ((totalSheathB - totalSheathA) / totalSheathB) * 100;
        itemData["pvcOuterInnerDiff"] = isFinite(diff)
          ? diff.toFixed(2) + "%"
          : diff === Infinity
            ? "+Inf (Sheet 1 sum is 0)"
            : "-Inf (Sheet 2 sum is 0)";
      }

      // Sheet Total: compare Sheet 2's SUM vs Sheet 1's IS BOM TOTAL
      const sumIdx = sheetB.headers.indexOf("SUM");
      const isBomTotalIdx = sheetA.headers.indexOf("IS BOM TOTAL");

      if (sumIdx >= 0 && sumIdx < rowB.length && isBomTotalIdx >= 0 && isBomTotalIdx < rowA.length) {
        const sumVal = parseNumeric(rowB[sumIdx]);
        const isBomTotalVal = parseNumeric(rowA[isBomTotalIdx]);

        if (sumVal !== null && isBomTotalVal !== null) {
          if (sumVal === 0) {
            itemData["sheetTotalDiff"] = isBomTotalVal === 0 ? null : "-Inf (SUM is 0)";
          } else {
            const diff = ((sumVal - isBomTotalVal) / sumVal) * 100;
            itemData["sheetTotalDiff"] = Number.isFinite(diff)
              ? diff.toFixed(2) + "%"
              : diff === Infinity ? "+Inf" : "-Inf";
          }
        }
      }

      // If alCu has no valid data (null or Inf diff) and alloy has data, use alloy's
      if (itemData["alloy"] != null &&
          (itemData["alCu"] == null ||
           (itemData["alCuDiff"] != null && String(itemData["alCuDiff"]).includes("Inf")))) {
        itemData["alCu"] = itemData["alloy"];
        itemData["alCuDiff"] = itemData["alloyDiff"];
        itemData["alCuPlusMinus"] = itemData["alloyPlusMinus"];
        itemData["alloy"] = null;
        itemData["alloyDiff"] = null;
        itemData["alloyPlusMinus"] = null;
      }
      itemSchedules[code] = itemData;
    }

    const upsertPayloads = Object.values(itemSchedules).map((d) => ({
      itemCode: d.itemCode ?? "",
      itemScheduleName: d.itemScheduleName ?? "",
      sheetTotalDiff: d.sheetTotalDiff ?? null,
      bomId: d.bomId ?? "",
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
      pvcOuterInnerDiff: d.pvcOuterInnerDiff ?? null,
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
            where: {
              itemCode_bomId: {
                itemCode: item.itemCode,
                bomId: item.bomId ?? "",
              },
            },
            create: item,
            update: item,
          }),
        ),
      ),
    );

    // return Response.json({
    //   success: true,
    //   summary: {
    //     totalMatched: matched.length,
    //     unmatchedInFileA: unmatchedA.length,
    //     unmatchedInFileB: unmatchedB.length,
    //     mapsApplied: maps.length,
    //   },
    //   itemSchedules: upserted,
    //   maps,
    //   unmatchedA,
    //   unmatchedB,
    // });
    return Response.json({
      success: true,
      summary: {
        totalMatched: matchedKeys.length,
        mapsApplied: maps.length,
      },
      itemSchedules: upserted,
      maps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
