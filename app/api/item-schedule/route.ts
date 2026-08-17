import { prisma } from "@/lib/prisma";

export async function POST(request: Request) {
  try {
    const body = await request.json();

    const raw = Array.isArray(body) ? body : body?.itemCodes;
    const itemCodes = (Array.isArray(raw) ? raw : [])
      .map((value: unknown) => String(value).trim())
      .filter(Boolean);

    if (itemCodes.length === 0) {
      return Response.json(
        {
          success: false,
          error: "body must be an array of itemCodes, e.g. { \"itemCodes\": [\"FA1200004\"] }",
        },
        { status: 400 },
      );
    }

    const matches = await prisma.itemSchedule.findMany({
      where: { itemCode: { in: itemCodes } },
      select: { itemCode: true, itemScheduleName: true },
      distinct: ["itemCode", "itemScheduleName"],
      orderBy: [{ itemCode: "asc" }, { id: "asc" }],
    });

    const results: Record<string, string[]> = {};
    for (const match of matches) {
      if (!results[match.itemCode]) results[match.itemCode] = [];
      results[match.itemCode].push(match.itemScheduleName);
    }

    const requested = [...new Set(itemCodes)];
    const found = requested.filter((code) => results[code]);
    const notFound = requested.filter((code) => !results[code]);

    return Response.json({
      success: true,
      results,
      found,
      notFound,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}