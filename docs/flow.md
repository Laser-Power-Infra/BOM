# BOM Comparison Flow

## Overview

The application allows users to upload two Excel files side by side, extract data from both, compare values using a configurable map-and-rules engine, and persist the results.

### High-Level Steps

1. **Upload** — Two independent `FileUpload` components accept `.xlsx`/`.xls` files. Each file is sent to `POST /api/upload`, which parses the Excel data, stores it as JSON in the `FileData` table, and returns a `fileId`.
2. **Compare** — A "Compare Files" button appears once both uploads succeed. Clicking it calls `POST /api/compare`, which loads the parsed data for both files, fetches the `Map` and `Rule` definitions from the database, matches rows by **Item Code**, computes percentage differences per column pair, evaluates threshold rules, and writes the results into `ItemSchedule` records grouped under an `UploadSession`.
3. **Results** — A results table displays the matched items, computed values, and coloured PlusMinus badges. Unmatched items from each file are shown separately.

---

## 1. Upload Phase

### 1.1 Two Independent File Uploaders

The page displays two [`FileUpload`](../../components/upload/file-upload.tsx) components side by side. Each accepts `.xlsx` / `.xls` files via drag-and-drop or the Browse button.

```
┌─────────────────────────┐  ┌─────────────────────────┐
│  File Uploader (A)      │  │  File Uploader (B)      │
│                         │  │                         │
│  [Browse]               │  │  [Browse]               │
│  fileA.xlsx  ✓ parsed   │  │  fileB.xlsx  ✓ parsed   │
│  Results: 45 rows       │  │  Results: 42 rows       │
└─────────────────────────┘  └─────────────────────────┘
```

Each uploader operates independently with its own state (selected files, parsing status, results). After parsing completes, the results (including the `fileId`) are emitted to the parent page via a callback prop.

### 1.2 Upload API (`POST /api/upload`)

| Aspect | Detail |
|--------|--------|
| **Method** | `POST` |
| **Route** | `/api/upload` |
| **Body** | `FormData` with key `"files"` containing the Excel file |
| **Content-Type** | `multipart/form-data` |
| **Response** | `{ success: boolean, results: FileResult[], error?: string }` |

#### Processing steps

1. Receive the Excel file from the `"files"` form field
2. Read the file buffer and parse it with the `xlsx` library
3. For each sheet in the workbook:
   - Convert rows to an array of plain objects: `{ "Header Name": value, ... }`
   - The first row is treated as the header row
   - Collect the sheet name and row count
4. Combine all sheets into a single array of row objects (all columns from all sheets merged; rows with the same index are merged by column name)
5. Store the combined data as a JSON array in the `FileData` table
6. Return a `FileResult` with the assigned `fileId`, filename, and per-sheet summaries

#### Response shape

```typescript
interface FileResult {
  fileName: string;
  fileId: number;
  sheets: SheetSummary[];
  totalRows: number;
}

interface SheetSummary {
  sheetName: string;
  rowCount: number;
  errors: string[];
}
```

#### Edge cases handled

| Scenario | Behaviour |
|----------|-----------|
| Empty file (no sheets, no rows) | Returns `success: true` with `totalRows: 0` |
| File has no header row | First row is treated as header; all values become strings |
| Duplicate column headers in the same sheet | Later columns with the same name overwrite earlier ones (last wins) |
| Merged cells | The `xlsx` library returns the value from the top-left cell of a merged range; other cells in the range are `undefined` |
| File cannot be parsed (corrupt / not a valid Excel file) | Returns `{ success: false, error: "Unable to parse file" }` |
| Very large file (many rows) | Parsed in memory; no streaming. Consider adding a row limit if needed |
| Non-Excel file sent despite `.xlsx`/`.xls`  extension filter | The library will fail to parse; returns an error |
| Empty cells | Represented as `null` in the row object |
| Cells with formulas | The `xlsx` library resolves formulas to their computed values when `{ cellFormula: false }` option is used |

### 1.3 Data Model — `FileData`

Stores parsed Excel rows as JSON for later retrieval during the comparison phase.

```prisma
model FileData {
  id        Int      @id @default(autoincrement())
  fileName  String
  data      Json     // Array of row objects: [{ "Item Code": "ABC", "Copper": 50, ... }, ...]
  createdAt DateTime @default(now())
}
```

**Storage format for `data`:** A JSON array where each element is a flat object mapping column header → cell value. Example:

```json
[
  { "Item Code": "CBL-001", "Copper Thickness": 1.5, "Insulation Type": "XLPE", "Dia (mm)": 12.5 },
  { "Item Code": "CBL-002", "Copper Thickness": 2.0, "Insulation Type": "PVC", "Dia (mm)": null }
]
```

> All cell values are stored as their native JavaScript type: numbers stay numbers, strings stay strings, empty cells become `null`.

---

## 2. Comparison Phase

### 2.1 Trigger

Once both `FileUpload` components have finished parsing (each has emitted a `FileResult` with a `fileId`), the parent page enables a **"Compare Files"** button. The button remains disabled until both sides report a successful parse.

```
┌─────────────────────────────────────────────┐
│  File A: fileA.xlsx (45 rows)  ✓            │
│  File B: fileB.xlsx (42 rows)  ✓            │
│                                             │
│  [ Compare Files ]                          │
└─────────────────────────────────────────────┘
```

### 2.2 Comparison API (`POST /api/compare`)

| Aspect | Detail |
|--------|--------|
| **Method** | `POST` |
| **Route** | `/api/compare` |
| **Body** | `{ fileId1: number, fileId2: number }` |
| **Response** | `{ success: boolean, sessionId: number, summary: CompareSummary, error?: string }` |

### 2.3 Data Sources

The comparison engine gathers data from three sources:

#### a) Parsed file data (FileData table)

Both `FileData` records are fetched by `fileId`. Each contains a JSON array of row objects keyed by column headers.

```
File A rows:
  "CBL-001" → { "Item Code": "CBL-001", "Copper Thickness": 1.5, "Insulation Type": "XLPE" }
  "CBL-002" → { "Item Code": "CBL-002", "Copper Thickness": 2.0, "Insulation Type": "PVC" }

File B rows:
  "CBL-001" → { "Item Code": "CBL-001", "Copper (Target)": 1.6, "Insulation Spec": "XLPE" }
  "CBL-002" → { "Item Code": "CBL-002", "Copper (Target)": 2.0, "Insulation Spec": "PVC" }
```

#### b) Map table

The `Map` table defines which columns from each file to compare and which `ItemSchedule` field to write the result into.

| Field | Type | Description |
|-------|------|-------------|
| `id` | Int | Primary key |
| `mapA` | String | Column header name in File A |
| `mapB` | String | Column header name in File B |
| `output` | String | Target field name in `ItemSchedule` (e.g., `cuTape`, `alloy`, `insulation`) |
| `Rules` | Relation | Associated threshold rules for this mapping |
| `createdAt` | DateTime | Record creation timestamp |
| `updatedAt` | DateTime | Record update timestamp |

**Example records:**

| id | mapA | mapB | output |
|----|------|------|--------|
| 1 | Copper Thickness | Copper (Target) | cuTape |
| 2 | Alloy % | Alloy Spec | alloy |
| 3 | Insulation Type | Insulation Spec | insulation |
| 4 | Armour Thickness | Armour Target | armour |

#### c) Rule table

Each `Rule` belongs to a `Map` and defines a single threshold condition. Rules within a map are non-overlapping — at most one rule matches for any given input value.

| Field | Type | Description |
|-------|------|-------------|
| `id` | Int | Primary key |
| `label` | String | Human-readable description (e.g., `"gt 5%"`, `"lt -5%"`) |
| `value` | String | Numeric threshold as a string (e.g., `"5"`, `"0"`) |
| `operator` | `RuleOperator` (enum) | `gt` (greater than), `lt` (less than), `eq` (equal) |
| `output` | `RuleOutput` (enum) | `PLUS_PLUS`, `PLUS`, `ZERO`, `MINUS`, `MINUS_MINUS` |
| `mapId` | Int? | Foreign key to the parent `Map` |
| `createdAt` | DateTime | Record creation timestamp |
| `updatedAt` | DateTime | Record update timestamp |

**RuleOperator enum:**

| Value | Meaning |
|-------|---------|
| `gt` | Percentage diff is **greater than** the threshold value |
| `lt` | Percentage diff is **less than** the threshold value |
| `eq` | Percentage diff is **exactly equal to** the threshold value |

**RuleOutput enum:**

| Value | Meaning | Display colour |
|-------|---------|----------------|
| `PLUS_PLUS` | Large positive deviation | Green |
| `PLUS` | Small positive deviation | Blue |
| `ZERO` | No deviation | Gray |
| `MINUS` | Small negative deviation | Orange |
| `MINUS_MINUS` | Large negative deviation | Red |

**Example: Rules belonging to Map `cuTape` (id = 1)**

| id | label | value | operator | output | mapId |
|----|-------|-------|----------|--------|-------|
| 1 | gt 5% | 5 | gt | PLUS_PLUS | 1 |
| 2 | lt -5% | -5 | lt | MINUS_MINUS | 1 |
| 3 | eq 0 | 0 | eq | ZERO | 1 |
| 4 | lt 0 (negatives less than 0) | 0 | lt | MINUS | 1 |
| 5 | lt 5 (positives less than 5) | 5 | lt | PLUS | 1 |

Together these rules cover every possible percentage diff value exactly once:

| Diff range | Matching rule | RuleOutput |
|------------|--------------|------------|
| `diff > 5` | rule 1: `gt 5` | `PLUS_PLUS` |
| `0 < diff < 5` | rule 5: `lt 5` | `PLUS` |
| `diff == 0` | rule 3: `eq 0` | `ZERO` |
| `-5 < diff < 0` | rule 4: `lt 0` | `MINUS` |
| `diff < -5` | rule 2: `lt -5` | `MINUS_MINUS` |

### 2.4 Row Matching

Rows from File A and File B are matched by the **"Item Code"** column. The matching algorithm is:

1. Build a lookup map for each file: `itemCode → rowObject`
2. Iterate over all unique `Item Code` values across both files
3. If the code exists in **both** files, it is a **matched pair**
4. If the code exists in **only one** file, it is logged as **unmatched**

**In case of duplicate Item Codes within a file:** The last occurrence in the array wins (later rows overwrite earlier ones). A warning is logged.

### 2.5 Per-Map Comparison

For each `Map` entry and each matched row pair, the following steps are executed:

#### Step 1: Extract and normalise values

```typescript
const rawA = rowFromFileA[map.mapA];
const rawB = rowFromFileB[map.mapB];

const valA = parseNumeric(rawA);
const valB = parseNumeric(rawB);
```

**`parseNumeric` logic:**

```typescript
function parseNumeric(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;

  if (typeof value === "number") {
    return isFinite(value) ? value : null;
  }

  if (typeof value === "string") {
    // Remove common units, commas, whitespace, and percentage signs
    const cleaned = value
      .replace(/[,$%\s]/g, "")     // remove $ , % whitespace
      .replace(/mm|cm|m|kg|g|lb/i, "") // remove common units
      .trim();

    if (cleaned === "") return null;

    const parsed = parseFloat(cleaned);
    return isFinite(parsed) ? parsed : null;
  }

  return null;
}
```

#### Step 2: Compute percentage difference

```typescript
if (valA === null || valB === null) {
  return { diff: null, skip: true };
}

const diff = ((valA - valB) / valB) * 100;
```

**Edge case — division by zero:**

| `valB` | `valA` | Behaviour |
|--------|--------|-----------|
| `0` | any non-zero value | Diff = `Infinity`. All `gt` rules will match; `lt` and `eq` rules will not. |
| `0` | `0` | Diff = `NaN` (0/0). Treated as `null` — comparison skipped. |

If `diff` is `null`, the row/map combination is skipped and no `ItemSchedule` record is created for it.

#### Step 3: Evaluate rules

Iterate over the map's rules and find the first (and only) match:

```typescript
let matchedOutput: RuleOutput | null = null;

for (const rule of map.Rules) {
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
```

Since rules are designed to be non-overlapping, exactly one rule should match for any finite `diff` value. If no rule matches (e.g., the rules don't cover all ranges), the PlusMinus field is left as `null`.

#### Step 4: Create ItemSchedule record

```typescript
const itemData = {
  uploadSessionId: sessionId,
  itemScheduleName: matchedItemCode,
  [map.output]: diff !== null ? diff.toFixed(2) + "%" : null,
  [map.output + "PlusMinus"]: matchedOutput,
};
```

**Field name resolution:**

The `map.output` value is used directly as a key in the `ItemSchedule` record. The PlusMinus counterpart is derived by appending `"PlusMinus"` to the output field name.

| `map.output` | Value field | PlusMinus field |
|--------------|-------------|-----------------|
| `cuTape` | `cuTape` | `cuTapePlusMinus` |
| `alloy` | `alloy` | `alloyPlusMinus` |
| `insulation` | `insulation` | `insulationPlusMinus` |
| `armour` | `armour` | `armourPlusMinus` |
| `semicon` | `semicon` | `semiconPlusMinus` |
| `pvcInner` | `pvcInner` | `pvcInnerPlusMinus` |
| `pvcOuter` | `pvcOuter` | `pvcOuterPlusMinus` |
| `filler` | `filler` | `fillerPlusMinus` |
| `polyt` | `polyt` | `polytPlusMinus` |
| `spclConstruction` | `spclConstruction` | `spclConstructionPlusMinus` |

> If `map.output` does not match any known field on the `ItemSchedule` model, the row is skipped and a warning is logged. This prevents silent data loss.

#### Step 5: Safety checks before persisting

- Validate that `map.output` is a real column on `ItemSchedule` (using the Prisma schema or a whitelist)
- If `diff` is `null`, set the value field to `null` and skip PlusMinus
- If no rule matched, set the PlusMinus field to `null` but still store the diff value

### 2.6 `UploadSession` Creation

A single `UploadSession` record groups all `ItemSchedule` records from the comparison:

```prisma
model UploadSession {
  id        Int             @id @default(autoincrement())
  file1Name String
  file2Name String
  itemSchedules ItemSchedule[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

All `ItemSchedule` records created during the comparison are linked to this session via `uploadSessionId`.

---

## 3. Results Display

### 3.1 Summary Bar

The top of the results panel shows a high-level summary:

```
┌─────────────────────────────────────────────────────────────┐
│  Compared: 40 matched · 5 in File A only · 2 in File B     │
│  only · 8 maps applied                                      │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Matched Items Table

| Item Code | Copper Thick. (A) | Copper (Target) (B) | % Diff | Cu Tape | Cu Tape ± |
|-----------|-------------------|---------------------|--------|---------|-----------|
| CBL-001 | 1.5 | 1.6 | -6.25% | -6.25% | MINUS |
| CBL-002 | 2.0 | 2.0 | 0% | 0% | ZERO |
| CBL-003 | 2.5 | 2.3 | 8.70% | 8.70% | PLUS_PLUS |

Each Map's output has its own column pair (value + PlusMinus).

**Colour coding for PlusMinus badges:**

| Value | Background | Text |
|-------|------------|------|
| `PLUS_PLUS` | Green (emerald-100) | Emerald-800 |
| `PLUS` | Blue (blue-100) | Blue-800 |
| `ZERO` | Gray (slate-100) | Slate-600 |
| `MINUS` | Orange (amber-100) | Amber-800 |
| `MINUS_MINUS` | Red (red-100) | Red-800 |

### 3.3 Unmatched Items Section

```
┌─ Only in File A ────────────────────────┐
│  CBL-010, CBL-011, CBL-012, CBL-013,   │
│  CBL-014                                 │
└─────────────────────────────────────────┘
┌─ Only in File B ────────────────────────┐
│  CBL-020, CBL-021                       │
└─────────────────────────────────────────┘
```

### 3.4 Skipped Items Section

If any rows were skipped due to non-numeric values or missing columns, a section shows them:

```
┌─ Skipped Comparisons ───────────────────┐
│  CBL-030: Copper Thickness value not    │
│  numeric ("N/A")                         │
│  CBL-031: Insulation Type column        │
│  missing in File B                       │
└─────────────────────────────────────────┘
```

---

## 4. API Endpoints

| Method | Route | Purpose |
|--------|-------|---------|
| `POST` | `/api/upload` | Upload and parse an Excel file; store rows in `FileData`; return `fileId` |
| `POST` | `/api/compare` | Compare two parsed files using Map + Rule definitions; persist results; return session summary |

### 4.1 `POST /api/upload` — Request/Response

**Request:**

```
POST /api/upload
Content-Type: multipart/form-data

Body:
  files: <Excel file>
```

**Response (success):**

```json
{
  "success": true,
  "results": [
    {
      "fileName": "fileA.xlsx",
      "fileId": 1,
      "sheets": [
        { "sheetName": "Sheet1", "rowCount": 45, "errors": [] }
      ],
      "totalRows": 45
    }
  ]
}
```

**Response (error):**

```json
{
  "success": false,
  "error": "Unable to parse the file. Please ensure it is a valid .xlsx or .xls file."
}
```

### 4.2 `POST /api/compare` — Request/Response

**Request:**

```json
POST /api/compare
Content-Type: application/json

{
  "fileId1": 1,
  "fileId2": 2
}
```

**Response (success):**

```json
{
  "success": true,
  "sessionId": 1,
  "summary": {
    "totalMatched": 40,
    "unmatchedInFileA": 5,
    "unmatchedInFileB": 2,
    "mapsApplied": 8,
    "skippedComparisons": 1,
    "skippedDetails": [
      { "itemCode": "CBL-030", "map": "Copper Thickness", "reason": "Non-numeric value in File A" }
    ]
  }
}
```

**Response (error):**

```json
{
  "success": false,
  "error": "One or both file IDs not found."
}
```

---

## 5. Database Schema

### 5.1 New Model: `FileData`

```prisma
model FileData {
  id        Int      @id @default(autoincrement())
  fileName  String
  data      Json
  createdAt DateTime @default(now())
}
```

### 5.2 Existing Models (unchanged)

```prisma
enum RuleOperator {
  gt
  lt
  eq
}

enum RuleOutput {
  PLUS_PLUS
  PLUS
  ZERO
  MINUS
  MINUS_MINUS
}

model Map {
  id        Int    @id @default(autoincrement())
  mapA      String
  mapB      String
  output    String
  Rules     Rule[]
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model Rule {
  id       Int          @id @default(autoincrement())
  label    String
  value    String
  mapId    Int?
  Map      Map?         @relation(fields: [mapId], references: [id])
  operator RuleOperator
  output   RuleOutput
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}

model UploadSession {
  id            Int            @id @default(autoincrement())
  file1Name     String
  file2Name     String
  itemSchedules ItemSchedule[]
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt
}

model ItemSchedule {
  id              Int            @id @default(autoincrement())
  uploadSessionId Int
  uploadSession   UploadSession @relation(fields: [uploadSessionId], references: [id], onDelete: Cascade)
  itemScheduleName String
  bomType          String?

  option2             String?
  ccvSioplas          String?
  cuTape              String?
  cuTapePlusMinus     String?
  alCu                String?
  alCuPlusMinus       String?
  alloy               String?
  alloyPlusMinus      String?
  armour              String?
  armourPlusMinus     String?
  semicon             String?
  semiconPlusMinus    String?
  insulation          String?
  insulationPlusMinus String?
  pvcInner            String?
  pvcInnerPlusMinus   String?
  pvcOuter            String?
  pvcOuterPlusMinus   String?
  filler              String?
  fillerPlusMinus     String?
  polyt               String?
  polytPlusMinus      String?
  spclConstruction    String?
  spclConstructionPlusMinus String?

  finalOutput String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
}
```

---

## 6. Component Changes

### 6.1 `FileUpload` — Add `onParsed` callback

```typescript
// New optional prop
interface FileUploadProps {
  onParsed?: (results: FileResult[]) => void;
}
```

The callback is invoked after all files are uploaded and parsed, with the accumulated results. This allows the parent page to collect the `fileId` values.

### 6.2 `app/page.tsx` — Orchestration

The home page manages two pieces of state:

```typescript
const [fileAResults, setFileAResults] = useState<FileResult[] | null>(null);
const [fileBResults, setFileBResults] = useState<FileResult[] | null>(null);
const [compareResult, setCompareResult] = useState<CompareResponse | null>(null);
const [comparing, setComparing] = useState(false);
```

**Flow:**
- Both `FileUpload` instances receive `onParsed` callbacks that update `fileAResults` / `fileBResults`
- A "Compare Files" button is enabled only when both `fileAResults` and `fileBResults` are non-null and non-empty
- Clicking the button sets `comparing = true`, calls `POST /api/compare`, and on success sets `compareResult`

### 6.3 `ComparisonResult` — New component

A new component at `components/comparison/comparison-result.tsx` renders:
- Summary bar
- Matched items table
- Unmatched items (file A only / file B only)
- Skipped comparisons

---

## 7. Installation Dependency

Add the `xlsx` npm package for Excel parsing:

```
npm install xlsx
```

---

## 8. Edge Cases — Complete Reference

### 8.1 Upload Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Empty Excel file (zero sheets) | Returns `success: true` with `totalRows: 0`; compare button will not enable (no rows to compare) |
| Corrupt file | Returns `success: false` with descriptive error |
| File with no "Item Code" column | Upload succeeds; comparison step will fail with "Item Code column not found in file" |
| Very large file (>100k rows) | Parsed in memory; may be slow. Consider adding a row limit (configurable) |
| File with only a header row (no data rows) | `totalRows: 0`; treated as empty |
| Cells with extremely long string values | Stored as-is in the JSON; no truncation |
| Binary Excel files (.xls, legacy format) | Supported by the `xlsx` library |
| Password-protected Excel files | The library may fail to open; returns error |
| Multiple files uploaded to one uploader | The `FileUpload` component already supports multiple files; each is uploaded separately and results are accumulated |
| Network failure during upload | Handled by `FileUpload` — shows error toast for the failed file and continues with remaining files |

### 8.2 Row Matching Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Duplicate Item Code in one file | Last occurrence wins; warning logged |
| Case mismatch in Item Code (e.g., "abc" vs "ABC") | **Case-sensitive** by default. Treated as different codes if cases differ |
| Whitespace in Item Code (e.g., " CBL-001" vs "CBL-001") | Whitespace is **not trimmed**. Consider trimming on read to avoid mismatches |
| Item Code column has different header name (e.g., "item_code" vs "Item Code") | Only the exact header "Item Code" is recognised. Different names → column not found error |
| File A has 100 rows, File B has 50 | 50 matched rows, 50 unmatched in File A |
| File A and File B have completely different Item Codes | 0 matched rows, all rows reported as unmatched |
| Item Code column is missing from either file | Comparison aborts with error message identifying which file |

### 8.3 Value Extraction Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| Value is a number | Used directly |
| Value is a string with units (e.g., "1.5 mm") | Units stripped: `"1.5 mm"` → `1.5` |
| Value is a string with percentage (e.g., "12.5%") | `%` stripped: `"12.5%"` → `12.5` |
| Value is a string with commas (e.g., "1,234.56") | Commas stripped: `"1,234.56"` → `1234.56` |
| Value is a non-numeric string (e.g., "N/A", "TBD", "none") | Returns `null`; row/map comparison skipped |
| Value is empty string `""` or `null` | Returns `null`; row/map comparison skipped |
| Value is `0` (valid numeric) | Used as-is; valid comparison |
| Value is boolean `true`/`false` | Returns `null` |
| Value is a date | Returns `null` (dates are not numeric comparisons) |
| Value is a very large number (e.g., 1e20) | Parsed as `Infinity` by `isFinite` check → `null` |

### 8.4 Percentage Difference Edge Cases

| Scenario | valA | valB | diff | Behaviour |
|----------|------|------|------|-----------|
| Normal case | 10 | 8 | 25 | Standard calculation |
| Target is zero | 5 | 0 | Infinity | All `gt` rules match; `lt` and `eq` don't |
| Both zero | 0 | 0 | NaN (0/0) | Treated as `null`; skipped |
| Both same non-zero | 10 | 10 | 0 | `eq 0` rules match |
| Null values | null | 5 | null | Skipped for this map |
| Negative values | -10 | -8 | -25 | Works normally (negative percentage) |
| valA > valB | 15 | 10 | 50 | Positive diff |
| valA < valB | 10 | 15 | -33.33 | Negative diff |

### 8.5 Rule Evaluation Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| `value` string cannot be parsed as number | Rule is skipped; warning logged |
| No rules exist for a Map | Value field will be populated; PlusMinus left null |
| No rule matches the diff value | PlusMinus left null; value still stored |
| Multiple rules could match (overlapping thresholds) | First match in iteration order wins. Design should prevent this |
| Rule with `operator: eq` and value `0` | Matches when diff is exactly 0 (including -0) |
| Infinity diff (valB = 0) | `gt` rules will match if threshold is not also Infinity |
| Negative threshold value (e.g., `lt -5`) | Comparators work with negative numbers natively |

### 8.6 Persistence Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| `map.output` is not a valid `ItemSchedule` field | Row skipped; warning logged |
| Same map.output used multiple times in different Map rows | Last write wins for the same ItemCode/output pair |
| Database write fails mid-way | No partial writes if using a transaction; error returned |
| Large number of ItemSchedule records (>1000) | Created in bulk via `createMany` for performance |

### 8.7 Pre-existing Data Edge Cases

| Scenario | Behaviour |
|----------|-----------|
| `Map` or `Rule` table is empty | Comparison returns 0 maps applied; no ItemSchedules created |
| `Rule` references a deleted `Map` | Orphaned rules are ignored (they have `mapId: null` after cascade delete, or are filtered out by the query) |
| `ItemSchedule` already has records from a previous comparison | New comparison creates a new `UploadSession` and new `ItemSchedule` records; old data is not modified |

---

## 9. File Changes Summary

| File | Action | Description |
|------|--------|-------------|
| `prisma/schema.prisma` | **Modify** | Add `FileData` model |
| `app/api/upload/route.ts` | **Create** | Excel upload, parse, and store endpoint |
| `app/api/compare/route.ts` | **Create** | Comparison engine endpoint |
| `components/upload/file-upload.tsx` | **Modify** | Add optional `onParsed` prop |
| `app/page.tsx` | **Modify** | Orchestrate upload and comparison flow |
| `components/comparison/comparison-result.tsx` | **Create** | Display comparison results |
| `package.json` | **Modify** | Add `xlsx` dependency |

---

## 10. Future Considerations

- **Streaming uploads** — For very large files, consider chunked uploads or server-side streaming
- **Caching parsed data** — `FileData` records could be purged after a configurable TTL to save space
- **Custom matching key** — Make the "Item Code" column configurable instead of hardcoded
- **Multi-file comparison** — Support comparing more than 2 files
- **Download results** — Allow exporting the comparison results as CSV/Excel
- **User authentication** — Tie `UploadSession` and `FileData` to a user
- **Rule ordering** — If overlapping rules become necessary, add a `priority`/`order` field to `Rule`
