import { prisma } from "@/lib/prisma";

function getExternalApiKey(request: Request): string | null {
  // header names are case-insensitive; try canonical and fallbacks
  const h = request.headers;
  return (
    h.get("externalapikey") ??
    h.get("ExternalApiKey") ??
    h.get("EXTERNALAPIKEY") ??
    h.get("x-externalapikey") ??
    h.get("x-externalApiKey") ??
    h.get("x-api-key") ??
    null
  );
}

function extractItemName(entry: unknown): string | null {
  if (typeof entry === "string") {
    const s = entry.trim();
    return s ? s : null;
  }
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const obj = entry as Record<string, unknown>;
    // support itemName / itemname / name keys case-insensitive
    const raw =
      obj.itemName ??
      obj.itemname ??
      obj["ItemName"] ??
      obj["ITEMNAME"] ??
      obj.name ??
      obj.Name ??
      obj.NAME;
    if (raw === undefined || raw === null) return null;
    const s = String(raw).trim();
    return s ? s : null;
  }
  return null;
}

export async function POST(request: Request) {
  try {
    // --- Auth: externalapikey header must match EXTERNAL_API_KEY ---
    const expected = process.env.EXTERNAL_API_KEY;
    if (expected) {
      const provided = getExternalApiKey(request);
      if (!provided || provided !== expected) {
        return Response.json(
          { success: false, error: "Unauthorized: invalid externalapikey" },
          { status: 401 }
        );
      }
    }

    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return Response.json(
        {
          success: false,
          error: 'Invalid JSON body. Expected array of objects e.g. [{"itemName":"COVERED CONDUCTOR"}]',
        },
        { status: 400 }
      );
    }

    // Support raw array or wrapped { items: [...] } / { itemNames: [...] } / { data: [...] }
    let rawArray: unknown;
    if (Array.isArray(body)) {
      rawArray = body;
    } else if (body && typeof body === "object" && !Array.isArray(body)) {
      const obj = body as Record<string, unknown>;
      rawArray = obj.items ?? obj.itemNames ?? obj.itemName ?? obj.data ?? null;
      if (!Array.isArray(rawArray)) {
        return Response.json(
          {
            success: false,
            error: 'body must be an array of objects e.g. [{"itemName":"COVERED CONDUCTOR"}]',
          },
          { status: 400 }
        );
      }
    } else {
      return Response.json(
        {
          success: false,
          error: 'body must be an array of objects e.g. [{"itemName":"COVERED CONDUCTOR"}]',
        },
        { status: 400 }
      );
    }

    const inputArray = rawArray as unknown[];

    if (inputArray.length === 0) {
      return Response.json(
        {
          success: false,
          error: "array must not be empty. e.g. [{\"itemName\":\"COVERED CONDUCTOR\"}]",
        },
        { status: 400 }
      );
    }

    // Extract normalized names preserving input order; track mapping to original key
    const normalized: string[] = [];
    const invalidIndices: number[] = [];
    for (let i = 0; i < inputArray.length; i++) {
      const name = extractItemName(inputArray[i]);
      if (name === null) {
        invalidIndices.push(i);
        continue;
      }
      normalized.push(name);
    }

    if (invalidIndices.length > 0) {
      return Response.json(
        {
          success: false,
          error: `Every array element must be an object with itemName. Invalid indices: ${invalidIndices.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (normalized.length === 0) {
      return Response.json(
        {
          success: false,
          error: "No valid itemName found. e.g. [{\"itemName\":\"COVERED CONDUCTOR\"}]",
        },
        { status: 400 }
      );
    }

    // --- Build deduplicated query for DB (case-insensitive exact) ---
    // Use OR with equals+mode insensitive since Prisma `in` does not support mode
    const uniqueLowerToOriginal = new Map<string, string>();
    const uniqueForQuery: string[] = [];
    for (const name of normalized) {
      const lower = name.toLowerCase();
      if (!uniqueLowerToOriginal.has(lower)) {
        uniqueLowerToOriginal.set(lower, name);
        uniqueForQuery.push(name);
      }
    }

    const rows =
      uniqueForQuery.length === 0
        ? []
        : await prisma.itemSchedule.findMany({
            where: {
              OR: uniqueForQuery.map((n) => ({
                itemName: { equals: n, mode: "insensitive" as const },
              })),
            },
            orderBy: [{ itemCode: "asc" }, { bomId: "asc" }],
          });

    // Group rows by lowercased itemName for fast lookup
    const grouped = new Map<string, typeof rows>();
    for (const row of rows) {
      if (!row.itemName) continue;
      const lower = row.itemName.trim().toLowerCase();
      if (!grouped.has(lower)) grouped.set(lower, []);
      grouped.get(lower)!.push(row);
    }

    // Build results object keyed by original query string (preserve input casing, include empty arrays)
    // If duplicate queries differ only by case, they merge under first-seen casing key
    const results: Record<string, typeof rows> = {};
    // Track which lower already assigned to respect first-key-wins merging
    const lowerToKey = new Map<string, string>();
    for (const name of normalized) {
      const lower = name.toLowerCase();
      const key = lowerToKey.get(lower) ?? name;
      if (!lowerToKey.has(lower)) {
        lowerToKey.set(lower, key);
        // init with rows or empty
        results[key] = grouped.get(lower) ?? [];
      }
      // if duplicate lower seen later, do not create second key; results already contains merged rows
    }

    // For normalized that were deduped, ensure all unique keys exist (already done)
    // Ensure total coverage even if some lower had no rows -> already init as []

    const found = Object.entries(results)
      .filter(([, v]) => v.length > 0)
      .map(([k]) => k);
    const notFound = Object.entries(results)
      .filter(([, v]) => v.length === 0)
      .map(([k]) => k);

    return Response.json({
      success: true,
      results,
      found,
      notFound,
      count: found.length,
      total: Object.keys(results).length,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
