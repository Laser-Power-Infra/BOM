import { fetchBothSheets } from "@/lib/google-sheets";

export async function GET() {
  try {
    const { sheetB } = await fetchBothSheets();
    return Response.json({
      success: true,
      headers: sheetB.headers,
      rows: sheetB.rows,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
