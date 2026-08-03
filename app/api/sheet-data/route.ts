import { fetchBothSheets } from "@/lib/google-sheets";

export async function GET() {
  try {
    const { sheetA, sheetB } = await fetchBothSheets();
    return Response.json({
      success: true,
      sheetB: {
        headers: sheetB.headers,
        rows: sheetB.rows,
      },
      sheetA: {
        headers: sheetA.headers,
        rows: sheetA.rows,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
