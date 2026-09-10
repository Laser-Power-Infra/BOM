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

function extractItemCode(entry: unknown): string | null {
  if (entry && typeof entry === "object" && !Array.isArray(entry)) {
    const obj = entry as Record<string, unknown>;
    // support itemCode / itemcode / code keys case-insensitive
    const raw =
      obj.itemCode ??
      obj.itemcode ??
      obj["ItemCode"] ??
      obj["ITEMCODE"] ??
      obj.code ??
      obj.Code ??
      obj.CODE;
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

    // --- Classify inputs: itemName (full rows) vs itemCode (single row) ---
    type Lookup = { kind: "name" | "code"; value: string };
    const lookups: Lookup[] = [];
    const invalidIndices: number[] = [];
    for (let i = 0; i < inputArray.length; i++) {
      const code = extractItemCode(inputArray[i]);
      if (code !== null) {
        lookups.push({ kind: "code", value: code });
        continue;
      }
      const name = extractItemName(inputArray[i]);
      if (name !== null) {
        lookups.push({ kind: "name", value: name });
        continue;
      }
      invalidIndices.push(i);
    }

    if (invalidIndices.length > 0) {
      return Response.json(
        {
          success: false,
          error: `Every array element must be an object with itemName or itemCode. Invalid indices: ${invalidIndices.join(", ")}`,
        },
        { status: 400 }
      );
    }

    if (lookups.length === 0) {
      return Response.json(
        {
          success: false,
          error: 'No valid itemName or itemCode found. e.g. [{"itemName":"COVERED CONDUCTOR"}]',
        },
        { status: 400 }
      );
    }

    // --- itemName lookups: fetch ALL rows (all fields), case-insensitive exact ---
    const uniqueNames = [
      ...new Set(
        lookups
          .filter((l) => l.kind === "name")
          .map((l) => l.value.toLowerCase()),
      ),
    ];
    const nameRows =
      uniqueNames.length === 0
        ? []
        : await prisma.itemSchedule.findMany({
            where: {
              OR: uniqueNames.map((n) => ({
                itemName: { equals: n, mode: "insensitive" as const },
              })),
            },
            orderBy: [{ itemCode: "asc" }, { bomId: "asc" }],
          });

    const groupedByName = new Map<string, typeof nameRows>();
    for (const row of nameRows) {
      if (!row.itemName) continue;
      const lower = row.itemName.trim().toLowerCase();
      if (!groupedByName.has(lower)) groupedByName.set(lower, []);
      groupedByName.get(lower)!.push(row);
    }

    // --- itemCode lookups: fetch ONE row (itemName + itemScheduleName), case-insensitive exact ---
    const uniqueCodes = [
      ...new Set(
        lookups
          .filter((l) => l.kind === "code")
          .map((l) => l.value.toLowerCase()),
      ),
    ];
    const groupedByCode = new Map<
      string,
      { itemName: string | null; itemScheduleName: string }[]
    >();
    for (const code of uniqueCodes) {
      const row = await prisma.itemSchedule.findFirst({
        where: { itemCode: { equals: code, mode: "insensitive" as const } },
        select: { itemName: true, itemScheduleName: true },
        orderBy: [{ bomId: "asc" }],
      });
      groupedByCode.set(code, row ? [row] : []);
    }

    // --- Build results keyed by original input string (preserve casing, first-seen wins) ---
    const results: Record<string, unknown[]> = {};
    const lowerToKey = new Map<string, string>();
    for (const lookup of lookups) {
      const lower = lookup.value.toLowerCase();
      if (lowerToKey.has(lower)) continue;
      lowerToKey.set(lower, lookup.value);
      results[lookup.value] =
        lookup.kind === "name"
          ? groupedByName.get(lower) ?? []
          : groupedByCode.get(lower) ?? [];
    }

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
