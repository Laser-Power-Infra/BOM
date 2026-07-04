import { prisma } from "@/lib/prisma";

export async function GET() {
  const maps = await prisma.map.findMany({
    include: { Rules: true },
    orderBy: { createdAt: "desc" },
  });
  return Response.json({ maps });
}

export async function POST(request: Request) {
  const body = await request.json();
  const { mapA, mapB, output, rules } = body;

  if (!mapA || !mapB || !output) {
    return Response.json({ error: "mapA, mapB, and output are required" }, { status: 400 });
  }

  const map = await prisma.map.create({
    data: {
      mapA,
      mapB,
      output,
      Rules: {
        create: (rules ?? []).map(
          (rule: { label: string; value: string; operator: string; output: string }) => ({
            label: rule.label,
            value: rule.value,
            operator: rule.operator,
            output: rule.output,
          })
        ),
      },
    },
    include: { Rules: true },
  });

  return Response.json({ map }, { status: 201 });
}
