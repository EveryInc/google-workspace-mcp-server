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
