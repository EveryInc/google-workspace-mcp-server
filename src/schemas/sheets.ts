import { z } from "zod";
import { ResponseFormat } from "../constants.js";

export const GetSpreadsheetSchema = z.object({
  spreadsheet_id: z.string()
    .min(1, "Spreadsheet ID is required")
    .describe("The ID of the Google Spreadsheet (found in the URL)"),
  include_grid_data: z.boolean()
    .default(false)
    .describe("Whether to include cell data (can be large)"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

export type GetSpreadsheetInput = z.infer<typeof GetSpreadsheetSchema>;

export const GetValuesSchema = z.object({
  spreadsheet_id: z.string()
    .min(1, "Spreadsheet ID is required")
    .describe("The ID of the Google Spreadsheet"),
  range: z.string()
    .min(1, "Range is required")
    .describe("The A1 notation range to read (e.g., 'Sheet1!A1:D10' or 'A1:D10')"),
  major_dimension: z.enum(["ROWS", "COLUMNS"])
    .default("ROWS")
    .describe("Whether to return data by rows or columns"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

export type GetValuesInput = z.infer<typeof GetValuesSchema>;

export const BatchGetValuesSchema = z.object({
  spreadsheet_id: z.string()
    .min(1, "Spreadsheet ID is required")
    .describe("The ID of the Google Spreadsheet"),
  ranges: z.array(z.string())
    .min(1, "At least one range is required")
    .describe("Array of A1 notation ranges to read (e.g., ['Sheet1!A1:D10', 'Sheet2!A1:B5'])"),
  major_dimension: z.enum(["ROWS", "COLUMNS"])
    .default("ROWS")
    .describe("Whether to return data by rows or columns"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

export type BatchGetValuesInput = z.infer<typeof BatchGetValuesSchema>;

export const UpdateValuesSchema = z.object({
  spreadsheet_id: z.string()
    .min(1, "Spreadsheet ID is required")
    .describe("The ID of the Google Spreadsheet"),
  range: z.string()
    .min(1, "Range is required")
    .describe("The A1 notation range to update (e.g., 'Sheet1!A1:D10')"),
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .min(1, "Values are required")
    .describe("2D array of values to write (rows of cells)"),
  value_input_option: z.enum(["RAW", "USER_ENTERED"])
    .default("USER_ENTERED")
    .describe("How to interpret input: 'RAW' for literal values, 'USER_ENTERED' to parse formulas")
}).strict();

export type UpdateValuesInput = z.infer<typeof UpdateValuesSchema>;

export const AppendValuesSchema = z.object({
  spreadsheet_id: z.string()
    .min(1, "Spreadsheet ID is required")
    .describe("The ID of the Google Spreadsheet"),
  range: z.string()
    .min(1, "Range is required")
    .describe("The A1 notation range to append to (e.g., 'Sheet1!A:D')"),
  values: z.array(z.array(z.union([z.string(), z.number(), z.boolean(), z.null()])))
    .min(1, "Values are required")
    .describe("2D array of values to append (rows of cells)"),
  value_input_option: z.enum(["RAW", "USER_ENTERED"])
    .default("USER_ENTERED")
    .describe("How to interpret input: 'RAW' for literal values, 'USER_ENTERED' to parse formulas"),
  insert_data_option: z.enum(["OVERWRITE", "INSERT_ROWS"])
    .default("INSERT_ROWS")
    .describe("How to insert: 'INSERT_ROWS' adds new rows, 'OVERWRITE' overwrites existing")
}).strict();

export type AppendValuesInput = z.infer<typeof AppendValuesSchema>;

export const CreateSpreadsheetSchema = z.object({
  title: z.string()
    .min(1, "Title is required")
    .max(500, "Title must not exceed 500 characters")
    .describe("The title for the new spreadsheet"),
  sheet_titles: z.array(z.string())
    .optional()
    .describe("Optional array of sheet names to create (default: one sheet named 'Sheet1')")
}).strict();

export type CreateSpreadsheetInput = z.infer<typeof CreateSpreadsheetSchema>;

export const BatchUpdateSpreadsheetSchema = z.object({
  spreadsheet_id: z.string()
    .min(1, "Spreadsheet ID is required")
    .describe("The ID of the Google Spreadsheet to update"),
  requests: z.array(z.record(z.unknown()))
    .min(1, "At least one request is required")
    .describe("Array of batch update request objects (see Google Sheets API batchUpdate documentation)")
}).strict();

export type BatchUpdateSpreadsheetInput = z.infer<typeof BatchUpdateSpreadsheetSchema>;

export const ClearValuesSchema = z.object({
  spreadsheet_id: z.string()
    .min(1, "Spreadsheet ID is required")
    .describe("The ID of the Google Spreadsheet"),
  range: z.string()
    .min(1, "Range is required")
    .describe("The A1 notation range to clear (e.g., 'Sheet1!A1:D10')")
}).strict();

export type ClearValuesInput = z.infer<typeof ClearValuesSchema>;

export const DuplicateSheetSchema = z.object({
  spreadsheet_id: z.string()
    .min(1, "Spreadsheet ID is required")
    .describe("The ID of the Google Spreadsheet"),
  sheet_id: z.number()
    .int()
    .describe("The ID of the sheet to duplicate (use sheets_get_spreadsheet to find sheet IDs)"),
  new_sheet_name: z.string()
    .optional()
    .describe("Name for the new sheet (defaults to 'Copy of [original name]')")
}).strict();

export type DuplicateSheetInput = z.infer<typeof DuplicateSheetSchema>;

// Pivot Table schemas

// Column reference helper (used in multiple schemas)
const ColumnRefSchema = z.union([
  z.number().int().min(0),
  z.string().regex(/^[A-Z]+$/i, "Must be a column letter (e.g., 'A', 'B', 'AA')")
]);

// Date/Time grouping rule
const DateTimeRuleSchema = z.object({
  type: z.enum([
    "SECOND", "MINUTE", "HOUR", "HOUR_MINUTE", "HOUR_MINUTE_AMPM",
    "DAY_OF_WEEK", "DAY_OF_MONTH", "DAY_OF_YEAR", "DAY_MONTH",
    "MONTH", "QUARTER", "YEAR", "YEAR_MONTH", "YEAR_QUARTER", "YEAR_MONTH_DAY"
  ]).describe("How to group date/time values")
});

// Histogram (numeric bucketing) rule
const HistogramRuleSchema = z.object({
  interval: z.number().positive().describe("Bucket size (e.g., 100 for 0-100, 100-200, etc.)"),
  start: z.number().optional().describe("Minimum value (values below go in separate bucket)"),
  end: z.number().optional().describe("Maximum value (values above go in separate bucket)")
});

// Manual grouping rule
const ManualRuleGroupSchema = z.object({
  group_name: z.string().describe("Name for this group"),
  items: z.array(z.union([z.string(), z.number()])).describe("Values to include in this group")
});

const ManualRuleSchema = z.object({
  groups: z.array(ManualRuleGroupSchema).min(1).describe("Array of custom groups")
});

// Sort by value configuration
const SortByValueSchema = z.object({
  value_index: z.number().int().min(0).describe("Index into values array (0 = first value)")
});

// Group rule (union of date_time, histogram, or manual)
const GroupRuleSchema = z.union([
  z.object({ date_time: DateTimeRuleSchema }),
  z.object({ histogram: HistogramRuleSchema }),
  z.object({ manual: ManualRuleSchema })
]);

// Enhanced Pivot Group Schema
const PivotGroupSchema = z.object({
  source_column: ColumnRefSchema.describe("Column index (0-based) or column letter (e.g., 'A', 'B', 'AA')"),
  label: z.string().optional().describe("Custom display name for this grouping"),
  show_totals: z.boolean().default(true).describe("Show subtotals for this group"),
  sort_order: z.enum(["ASCENDING", "DESCENDING"]).optional().describe("Sort order for group values"),
  sort_by_value: SortByValueSchema.optional().describe("Sort groups by aggregated value instead of alphabetically"),
  group_rule: GroupRuleSchema.optional().describe("How to bucket/group values (date_time, histogram, or manual)"),
  group_limit: z.number().int().positive().optional().describe("Maximum number of groups to display")
});

// Filter condition types
const FilterConditionSchema = z.object({
  type: z.enum([
    "NUMBER_GREATER", "NUMBER_GREATER_THAN_EQ",
    "NUMBER_LESS", "NUMBER_LESS_THAN_EQ",
    "NUMBER_EQ", "NUMBER_NOT_EQ",
    "NUMBER_BETWEEN", "NUMBER_NOT_BETWEEN",
    "TEXT_CONTAINS", "TEXT_NOT_CONTAINS",
    "TEXT_STARTS_WITH", "TEXT_ENDS_WITH",
    "TEXT_EQ", "TEXT_NOT_EQ",
    "DATE_EQ", "DATE_BEFORE", "DATE_AFTER",
    "DATE_ON_OR_BEFORE", "DATE_ON_OR_AFTER",
    "DATE_BETWEEN", "DATE_NOT_BETWEEN",
    "DATE_IS_VALID",
    "BLANK", "NOT_BLANK"
  ]).describe("Condition type"),
  values: z.array(z.union([z.string(), z.number()])).optional()
    .describe("Values for the condition (e.g., [100] for NUMBER_GREATER, [10, 50] for NUMBER_BETWEEN)")
});

// Pivot Filter Schema
const PivotFilterSchema = z.object({
  source_column: ColumnRefSchema.describe("Column to filter on"),
  visible_values: z.array(z.string()).optional()
    .describe("Only show rows where column matches these values"),
  condition: FilterConditionSchema.optional()
    .describe("Filter by condition (alternative to visible_values)")
});

// Enhanced Pivot Value Schema
const PivotValueSchema = z.object({
  source_column: ColumnRefSchema.optional()
    .describe("Column to aggregate (omit if using formula)"),
  formula: z.string().optional()
    .describe("Custom formula starting with '=' (e.g., '=Revenue/Quantity')"),
  summarize_function: z.enum([
    "SUM", "COUNT", "COUNTA", "COUNTUNIQUE", "AVERAGE",
    "MAX", "MIN", "MEDIAN", "PRODUCT", "STDEV", "STDEVP", "VAR", "VARP",
    "CUSTOM"
  ]).describe("Aggregation function (use CUSTOM with formula)"),
  name: z.string().optional().describe("Custom display name for this value column"),
  calculated_display_type: z.enum([
    "PERCENT_OF_ROW_TOTAL",
    "PERCENT_OF_COLUMN_TOTAL",
    "PERCENT_OF_GRAND_TOTAL"
  ]).optional().describe("Display as percentage instead of raw value")
}).refine(
  data => data.source_column !== undefined || data.formula !== undefined,
  { message: "Either source_column or formula is required" }
).refine(
  data => !(data.source_column !== undefined && data.formula !== undefined),
  { message: "Cannot specify both source_column and formula" }
);

// Main Create Pivot Table Schema
export const CreatePivotTableSchema = z.object({
  spreadsheet_id: z.string()
    .min(1, "Spreadsheet ID is required")
    .describe("The ID of the Google Spreadsheet"),
  source_range: z.string()
    .min(1, "Source range is required")
    .describe("A1 notation range containing the source data (e.g., 'Sheet1!A1:E100', 'Data!A:F')"),
  destination_sheet_id: z.number()
    .int()
    .optional()
    .describe("Sheet ID where pivot table will be placed (default: creates a new sheet)"),
  destination_sheet_name: z.string()
    .default("Pivot Table")
    .describe("Name for the new sheet if destination_sheet_id is not provided"),
  rows: z.array(PivotGroupSchema)
    .optional()
    .describe("Row groupings for the pivot table"),
  columns: z.array(PivotGroupSchema)
    .optional()
    .describe("Column groupings for the pivot table"),
  values: z.array(PivotValueSchema)
    .min(1, "At least one value aggregation is required")
    .describe("Value aggregations (e.g., SUM of Revenue, COUNT of Orders)"),
  filters: z.array(PivotFilterSchema)
    .optional()
    .describe("Filter source data before pivoting"),
  value_layout: z.enum(["HORIZONTAL", "VERTICAL"])
    .default("HORIZONTAL")
    .describe("Layout for multiple values: HORIZONTAL (side by side) or VERTICAL (stacked)")
}).strict().refine(
  data => (data.rows && data.rows.length > 0) || (data.columns && data.columns.length > 0),
  { message: "At least one row or column grouping is required" }
);

export type CreatePivotTableInput = z.infer<typeof CreatePivotTableSchema>;
export type PivotGroupInput = z.infer<typeof PivotGroupSchema>;
export type PivotValueInput = z.infer<typeof PivotValueSchema>;
export type PivotFilterInput = z.infer<typeof PivotFilterSchema>;
export type GroupRuleInput = z.infer<typeof GroupRuleSchema>;
export type DateTimeRuleInput = z.infer<typeof DateTimeRuleSchema>;
export type HistogramRuleInput = z.infer<typeof HistogramRuleSchema>;
export type ManualRuleInput = z.infer<typeof ManualRuleSchema>;
export type FilterConditionInput = z.infer<typeof FilterConditionSchema>;
