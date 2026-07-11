import { google } from "googleapis";

export interface SheetResult {
  sheetName: string;
  totalRows: number;
  errors: string[];
}

function getSpreadsheetId(): string {
  const id = process.env.GOOGLE_SPREADSHEET_ID;
  if (!id) throw new Error("GOOGLE_SPREADSHEET_ID is not configured");
  return id;
}

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = process.env.GOOGLE_PRIVATE_KEY;
  if (!email || !key) {
    throw new Error("Google service account credentials not configured");
  }
  return new google.auth.JWT({
    email,
    key: key.replace(/\\n/g, "\n"),
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
  });
}

function getClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

export async function fetchSheetMetadata(): Promise<{
  spreadsheetId: string;
  sheets: SheetResult[];
}> {
  const spreadsheetId = getSpreadsheetId();
  const sheets = getClient();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });

  const sheetTitles =
    meta.data.sheets?.map((s) => s.properties?.title).filter(Boolean) ?? [];

  const expectedSheets = ["NON CHAIN BOM", "MRP/IS"];
  for (const name of expectedSheets) {
    if (!sheetTitles.includes(name)) {
      throw new Error(`Sheet "${name}" not found in the spreadsheet`);
    }
  }

  const results: SheetResult[] = [];

  for (const sheetName of expectedSheets) {
    try {
      const response = await sheets.spreadsheets.values.get({
        spreadsheetId,
        range: `'${sheetName}'!A:ZZZ`,
        valueRenderOption: "UNFORMATTED_VALUE",
      });

      const rows = response.data.values ?? [];
      const dataRows = rows.length > 1 ? rows.slice(1).filter((r) => r.some((c) => c !== null && c !== "")) : [];

      results.push({ sheetName, totalRows: dataRows.length, errors: [] });
    } catch (err) {
      results.push({
        sheetName,
        totalRows: 0,
        errors: [err instanceof Error ? err.message : "Unknown error"],
      });
    }
  }

  return { spreadsheetId, sheets: results };
}

export async function fetchBothSheets(): Promise<{
  sheetA: { name: string; headers: string[]; rows: unknown[][] };
  sheetB: { name: string; headers: string[]; rows: unknown[][] };
}> {
  const spreadsheetId = getSpreadsheetId();
  const sheets = getClient();

  const meta = await sheets.spreadsheets.get({ spreadsheetId });
  const sheetTitles =
    meta.data.sheets?.map((s) => s.properties?.title).filter(Boolean) ?? [];

  if (!sheetTitles.includes("NON CHAIN BOM")) {
    throw new Error('Sheet "NON CHAIN BOM" not found');
  }
  if (!sheetTitles.includes("MRP/IS")) {
    throw new Error('Sheet "MRP/IS" not found');
  }

  const responseA = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'NON CHAIN BOM'!A:ZZZ",
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const responseB = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: "'MRP/IS'!A:ZZZ",
    valueRenderOption: "UNFORMATTED_VALUE",
  });

  const allA = responseA.data.values ?? [];
  const allB = responseB.data.values ?? [];

  const headersA = allA.length > 2 ? allA[2].map(String) : [];
  const headersB = allB.length > 1 ? allB[1].map(String) : [];

  const rowsA = allA.slice(3).filter((r) => r.some((c) => c !== null && c !== ""));
  const rowsB = allB.slice(2).filter((r) => r.some((c) => c !== null && c !== ""));

  return {
    sheetA: { name: "NON CHAIN BOM", headers: headersA, rows: rowsA },
    sheetB: { name: "MRP/IS", headers: headersB, rows: rowsB },
  };
}
