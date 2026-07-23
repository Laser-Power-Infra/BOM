import { prisma } from "@/lib/prisma";
import { fetchBothSheets } from "@/lib/google-sheets";
import pLimit from "p-limit";
import { log } from "console";

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

    // --- Precompute map column indices to avoid redundant indexOf calls ---
    const mapIndices = maps.map((m) => ({
      colAIdx: sheetA.headers.indexOf(m.mapA),
      colBIndices: m.mapB
        .split("|")
        .map((h) => sheetB.headers.indexOf(h.trim())),
      colBIdx: sheetB.headers.indexOf(m.mapB),
    }));

    // --- Locate required columns in both sheets ---
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

    // --- Build lookupA: keyed by "fgItem|bomCode" from Sheet A ---
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

    // --- Build lookupBByItemCode: grouped by itemCode from Sheet B (no composite key) ---
    const lookupBByItemCode = new Map<
      string,
      { row: unknown[]; itemCode: string; isBomId: string }[]
    >();
    for (const row of sheetB.rows) {
      const itemCode = String(row[itemCodeIdxB] ?? "").trim();
      const isBomId = String(row[isBomIdIdx] ?? "").trim();
      if (itemCode) {
        if (!lookupBByItemCode.has(itemCode))
          lookupBByItemCode.set(itemCode, []);
        lookupBByItemCode.get(itemCode)!.push({ row, itemCode, isBomId });
      }
    }

    // --- Build fgItem index from Sheet A for B→A lookup by itemCode ---
    const lookupAByFgItem = new Map<
      string,
      { row: unknown[]; fgItem: string; bomCode: string }[]
    >();
    for (const [key, entry] of lookupA) {
      const [fgItem] = key.split("|");
      if (!lookupAByFgItem.has(fgItem)) lookupAByFgItem.set(fgItem, []);
      lookupAByFgItem.get(fgItem)!.push(entry);
    }

    const usedSheetAKeys = new Set<string>();
    const itemScheduleIdxA = sheetA.headers.indexOf("ITEM SCHEDULE");
    const itemNameIdxA = sheetA.headers.indexOf("Item Name");
    const itemSchedules: Record<string, Record<string, string | null>> = {};

    //combined alCu + alloy diff
    const alCuMapIdx = maps.findIndex((m) => m.output === "alCu");
    const alloyMapIdx = maps.findIndex((m) => m.output === "alloy");

    // ===== PASS 1: Iterate ALL Sheet B itemCodes, match by itemCode → fgItem =====
    for (const [itemCode, bEntries] of lookupBByItemCode) {
      const matchingA = lookupAByFgItem.get(itemCode) ?? [];
      const matched = matchingA.length > 0;
      const entryB = bEntries[0]; // take first Sheet B entry for this itemCode

      if (matched) {
        // Sheet B itemCode found in Sheet A → compare against each matching Sheet A row
        for (const entryA of matchingA) {
          usedSheetAKeys.add(`${entryA.fgItem}|${entryA.bomCode}`);
          const rowA = entryA.row;
          const rowB = entryB.row;
          const itemName =
            itemScheduleIdxA >= 0
              ? String(rowA[itemScheduleIdxA] ?? "").trim()
              : "";

          // --- Build base itemData: itemCode from Sheet B, bomId/itemScheduleName from Sheet A ---
          const itemData: Record<string, string | null> = {
            itemCode: entryB.itemCode,
            itemScheduleName: itemName,
            itemName:
              itemNameIdxA >= 0
                ? String(rowA[itemNameIdxA] ?? "").trim()
                : null, // NEW
            bomId: entryA.bomCode,
          };

          const outputsPopulated = new Set<string>();
          const log = (msg: string) => {
            if (
              itemCode === "FA1200004"
              // && entryB.isBomId === "U1-C0003-146"
            )
              console.log("detailsss.................", msg);
          };

          // --- Per-map comparison: iterate all maps, compare Sheet A column vs Sheet B column ---
          for (const [i, map] of maps.entries()) {
            if (!VALID_OUTPUT_FIELDS.has(map.output)) continue;
            if (outputsPopulated.has(map.output)) continue;

            const colA = mapIndices[i].colAIdx;
            if (colA < 0 || colA >= rowA.length) continue;
            const valA = parseNumeric(rowA[colA]);
            if (valA === null) continue;

            let valB: number | null = null;
            for (const idx of mapIndices[i].colBIndices) {
              if (idx < 0 || idx >= rowB.length) continue;
              const parsed = parseNumeric(rowB[idx]);
              if (parsed !== null && parsed !== 0) {
                valB = parsed;
                break;
              }
            }
            if (valB === null) continue;

            itemData[map.output] = map.outputText;
            if (map.ccvsiovalue) itemData["ccvSioplas"] = map.ccvsiovalue;
            outputsPopulated.add(map.output);

            const diff =
              valB !== 0
                ? ((valB - valA) / valB) * 100
                : valA !== 0
                  ? -Infinity
                  : 0;

            if (diff === null) {
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
            if (map.output !== "finalOutput")
              itemData[map.output + "Diff"] = diffStr;

            const applicableRules = itemName
              ? map.Rules.filter((r) => !r.category || r.category === itemName)
              : map.Rules.filter((r) => !r.category);

            let matchedOutput: string | null = null;
            for (const rule of applicableRules) {
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
            itemData[map.output + "PlusMinus"] = matchedOutput;
          }
          if (outputsPopulated.size === 0) { itemData["spclConstruction"] = "SPCL"; }

          // --- pvcOuterInnerDiff: sum unique matched sheath columns ---
          {
            const sheathOutputs = new Set(["pvcOuter", "pvcInner"]);
            let totalSheathA = 0,
              totalSheathB = 0;
            const seenA = new Set<number>(),
              seenB = new Set<number>();
            for (const [i, m] of maps.entries()) {
              if (!sheathOutputs.has(m.output)) continue;
              const cA = mapIndices[i].colAIdx;
              const cB = mapIndices[i].colBIdx;
              if (cA < 0 || cB < 0 || cA >= rowA.length || cB >= rowB.length)
                continue;
              const vA = parseNumeric(rowA[cA]);
              const vB = parseNumeric(rowB[cB]);
              if (vA !== null && !seenA.has(cA)) {
                totalSheathA += vA;
                seenA.add(cA);
              }
              if (vB !== null && !seenB.has(cB)) {
                totalSheathB += vB;
                seenB.add(cB);
              }
            }
            if (totalSheathB === 0) {
              itemData["pvcOuterInnerDiff"] =
                totalSheathA === 0 ? null : "-Inf (Outer+Inner sum is 0)";
            } else if (totalSheathA === 0) {
              itemData["pvcOuterInnerDiff"] = null;
            } else {
              const diff = ((totalSheathB - totalSheathA) / totalSheathB) * 100;
              itemData["pvcOuterInnerDiff"] = isFinite(diff)
                ? diff.toFixed(2) + "%"
                : diff === Infinity
                  ? "+Inf (Sheet 1 sum is 0)"
                  : "-Inf (Sheet 2 sum is 0)";
            }
          }

          // --- Option2: compare Sheet B's SUM vs Sheet A's TOTAL for classification and diff ---
          {
            const sumIdx = sheetB.headers.indexOf("SUM");
            const totalIdx = sheetA.headers.indexOf("TOTAL");
            if (sumIdx >= 0 && totalIdx >= 0) {
              const sumVal = parseNumeric(rowB[sumIdx]);
              const totalVal = parseNumeric(rowA[totalIdx]);
              if (sumVal !== null && totalVal !== null) {
                // Classification: valA (TOTAL) > valB (SUM) → IS Tested
                itemData["option2"] =
                  totalVal > sumVal
                    ? "IS Tested"
                    : totalVal === sumVal
                      ? "IS"
                      : "Normal";
                // Difference %
                if (sumVal === 0) {
                  itemData["option2Diff"] =
                    totalVal === 0 ? null : "-Inf (SUM is 0)";
                } else {
                  const diff = ((sumVal - totalVal) / sumVal) * 100;
                  itemData["option2Diff"] = isFinite(diff)
                    ? diff.toFixed(2) + "%"
                    : diff === Infinity
                      ? "+Inf"
                      : "-Inf";
                }
              }
            }
          }

          // --- alCu fallback: if alCu has no data but alloy does, use alloy's values ---
          if (
            itemData["alloy"] != null &&
            (itemData["alCu"] == null ||
              (itemData["alCuDiff"] != null &&
                String(itemData["alCuDiff"]).includes("Inf")))
          ) {
            itemData["alCu"] = itemData["alloy"];
            itemData["alCuDiff"] = itemData["alloyDiff"];
            itemData["alCuPlusMinus"] = itemData["alloyPlusMinus"];
            itemData["alloy"] = null;
            itemData["alloyDiff"] = null;
            itemData["alloyPlusMinus"] = null;
          }
          // --- Combined Al/Cu + Alloy diff: when Sheet A has no alloy column but Sheet B has both ---
          if (
            itemData["alCu"] != null &&
            itemData["alloy"] == null &&
            alCuMapIdx >= 0 &&
            alloyMapIdx >= 0
          ) {
            const alCuMi = mapIndices[alCuMapIdx];
            const alloyMi = mapIndices[alloyMapIdx];
            let valBAlCu: number | null = null;
            for (const idx of alCuMi.colBIndices) {
              if (idx >= 0 && idx < rowB.length) {
                const v = parseNumeric(rowB[idx]);
                if (v !== null && v !== 0) {
                  valBAlCu = v;
                  break;
                }
              }
            }
            let valBAlloy: number | null = null;
            for (const idx of alloyMi.colBIndices) {
              if (idx >= 0 && idx < rowB.length) {
                const v = parseNumeric(rowB[idx]);
                if (v !== null && v !== 0) {
                  valBAlloy = v;
                  break;
                }
              }
            }
            const valAAlCu =
              alCuMi.colAIdx >= 0 ? parseNumeric(rowA[alCuMi.colAIdx]) : null;
            if (valBAlCu !== null && valBAlloy !== null && valAAlCu !== null) {
              const combinedB = valBAlCu + valBAlloy;
              if (combinedB !== 0) {
                const diff = ((combinedB - valAAlCu) / combinedB) * 100;
                // const alloyOutputText = maps[alloyMapIdx].outputText ?? "ALLOY";
                // itemData["alloy"] = alloyOutputText;
                itemData["alloyDiff"] = isFinite(diff)
                  ? diff.toFixed(2) + "%"
                  : diff === Infinity
                    ? "+Inf"
                    : "-Inf";

                log(
                  `Combined Al/Cu + Alloy diff: valAAlCu=${valAAlCu}, valBAlCu=${valBAlCu}, valBAlloy=${valBAlloy}, combinedB=${combinedB}, diff=${itemData["alloyDiff"]}`,
                );
                // Re-evaluate PlusMinus using the alCu map's rules with the new diff
                const alCuMap = maps[alCuMapIdx];
                const applicableRules = itemName
                  ? alCuMap.Rules.filter(
                      (r) => !r.category || r.category === itemName,
                    )
                  : alCuMap.Rules.filter((r) => !r.category);
                for (const rule of applicableRules) {
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
                    itemData["alloyPlusMinus"] = rule.output;
                    break;
                  }
                }
              }
            }
          }
          // --- Sheet Total Diff: compare Sheet A's IS BOM TOTAL vs TOTAL ---
          {
            const isBomTotalIdx = sheetA.headers.indexOf("IS BOM TOTAL");
            const totalIdx = sheetA.headers.indexOf("TOTAL");
            if (
              isBomTotalIdx >= 0 &&
              isBomTotalIdx < rowA.length &&
              totalIdx >= 0 &&
              totalIdx < rowA.length
            ) {
              const valB = parseNumeric(rowA[isBomTotalIdx]);
              const valA = parseNumeric(rowA[totalIdx]);
              if (valB !== null && valA !== null) {
                if (valB === 0) {
                  itemData["sheetTotalDiff"] =
                    valA === 0 ? null : "-Inf (IS BOM TOTAL is 0)";
                } else {
                  const diff = ((valB - valA) / valB) * 100;
                  itemData["sheetTotalDiff"] = isFinite(diff)
                    ? diff.toFixed(2) + "%"
                    : diff === Infinity
                      ? "+Inf"
                      : "-Inf";
                }
              }
            }
          }

          itemSchedules[`${entryB.itemCode}|${entryA.bomCode}`] = itemData;
        }
      } else {
        // --- Unmatched Sheet B: no matching fgItem in Sheet A, store with nulls ---
        const itemData: Record<string, string | null> = {
          itemCode: entryB.itemCode,
          itemScheduleName: "",
          bomId: entryB.isBomId,
        };
        // log(
        //   `.......................Unmatched Sheet B: ${entryB.itemCode} | ${entryB.isBomId}`,
        // );
        itemSchedules[itemCode] = itemData;
      }
    }

    // ===== PASS 2: Only unmatched Sheet A records (no comparison possible) =====
    for (const [key, entryA] of lookupA) {
      if (usedSheetAKeys.has(key)) continue;

      const rowA = entryA.row;
      const itemData: Record<string, string | null> = {
        itemCode: entryA.fgItem,
        itemScheduleName:
          itemScheduleIdxA >= 0
            ? String(rowA[itemScheduleIdxA] ?? "").trim()
            : "",
        itemName:
          itemNameIdxA >= 0 ? String(rowA[itemNameIdxA] ?? "").trim() : null, // NEW

        bomId: entryA.bomCode,
      };
      // All comparison fields stay null — no Sheet B data to compare
      // --- Sheet Total Diff: compare Sheet A's IS BOM TOTAL vs TOTAL ---
      {
        const isBomTotalIdx = sheetA.headers.indexOf("IS BOM TOTAL");
        const totalIdx = sheetA.headers.indexOf("TOTAL");
        if (
          isBomTotalIdx >= 0 &&
          isBomTotalIdx < rowA.length &&
          totalIdx >= 0 &&
          totalIdx < rowA.length
        ) {
          const valB = parseNumeric(rowA[isBomTotalIdx]);
          const valA = parseNumeric(rowA[totalIdx]);
          if (valB !== null && valA !== null) {
            if (valB === 0) {
              itemData["sheetTotalDiff"] =
                valA === 0 ? null : "-Inf (IS BOM TOTAL is 0)";
            } else {
              const diff = ((valB - valA) / valB) * 100;
              itemData["sheetTotalDiff"] = isFinite(diff)
                ? diff.toFixed(2) + "%"
                : diff === Infinity
                  ? "+Inf"
                  : "-Inf";
            }
          }
        }
      }
      // log(`..........................{itemData: ${JSON.stringify(itemData)}}`);
      itemSchedules["A_" + key] = itemData;
    }

    // --- Build upsert payloads ---
    const upsertPayloads = Object.values(itemSchedules).map((d) => ({
      itemCode: d.itemCode ?? "",
      itemScheduleName: d.itemScheduleName ?? "",
      itemName: d.itemName ?? null,
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

    // --- Return summary ---
    return Response.json({
      success: true,
      summary: {
        totalMatched: [...lookupBByItemCode.keys()].filter((ic) =>
          lookupAByFgItem.has(ic),
        ).length,
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
