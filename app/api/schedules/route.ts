import { prisma } from "@/lib/prisma";

export async function GET() {
  try {
    const items = await prisma.itemSchedule.findMany({
      orderBy: [{ itemCode: "asc" }, { bomId: "asc" }],
    });
    const maps = await prisma.map.findMany({
      include: { Rules: true },
      orderBy: { id: "asc" },
    });
    return Response.json({ success: true, itemSchedules: items, maps });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
