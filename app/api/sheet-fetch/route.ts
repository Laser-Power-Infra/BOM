import { fetchSheetMetadata } from "@/lib/google-sheets";

export async function POST() {
  try {
    const result = await fetchSheetMetadata();
    return Response.json({ success: true, ...result });
  } catch (err) {
    console.error(err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return Response.json({ success: false, error: message }, { status: 500 });
  }
}
