import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getSheetsClient, handleGoogleError } from "../services/google-auth.js";
import {
  GetSpreadsheetSchema,
  GetValuesSchema,
  BatchGetValuesSchema,
  UpdateValuesSchema,
  AppendValuesSchema,
  CreateSpreadsheetSchema,
  BatchUpdateSpreadsheetSchema,
  ClearValuesSchema,
  DuplicateSheetSchema,
  CreatePivotTableSchema,
  type GetSpreadsheetInput,
  type GetValuesInput,
  type BatchGetValuesInput,
  type UpdateValuesInput,
  type AppendValuesInput,
  type CreateSpreadsheetInput,
  type BatchUpdateSpreadsheetInput,
  type ClearValuesInput,
  type DuplicateSheetInput,
  type CreatePivotTableInput,
  type PivotGroupInput,
  type PivotValueInput,
  type PivotFilterInput,
  type GroupRuleInput
} from "../schemas/sheets.js";
import { ResponseFormat, CHARACTER_LIMIT } from "../constants.js";
import type { sheets_v4 } from "googleapis";

function formatValuesAsMarkdown(values: (string | number | boolean | null)[][] | undefined, range: string): string {
  if (!values || values.length === 0) {
    return `No data found in range: ${range}`;
  }

  const lines: string[] = [`## Data from ${range}`, ""];

  // Create markdown table
  const headers = values[0].map((_, i) => `Col ${i + 1}`);
  lines.push(`| ${headers.join(" | ")} |`);
  lines.push(`| ${headers.map(() => "---").join(" | ")} |`);

  for (const row of values) {
    const cells = row.map(cell => cell === null || cell === undefined ? "" : String(cell));
    lines.push(`| ${cells.join(" | ")} |`);
  }

  return lines.join("\n");
}

function formatSheetInfo(sheet: sheets_v4.Schema$Sheet): string {
  const props = sheet.properties;
  if (!props) return "Unknown sheet";

  return [
    `- **${props.title}** (ID: ${props.sheetId})`,
    `  - Type: ${props.sheetType || "GRID"}`,
    `  - Rows: ${props.gridProperties?.rowCount || 0}`,
    `  - Columns: ${props.gridProperties?.columnCount || 0}`
  ].join("\n");
}

// Helper: Convert column letter to 0-based index (A=0, B=1, AA=26)
function columnLetterToIndex(letter: string): number {
  let index = 0;
  const upper = letter.toUpperCase();
  for (let i = 0; i < upper.length; i++) {
    index = index * 26 + (upper.charCodeAt(i) - 64);
  }
  return index - 1;
}

// Helper: Convert source_column (number or letter) to 0-based index
function resolveColumnIndex(column: number | string): number {
  if (typeof column === "number") {
    return column;
  }
  return columnLetterToIndex(column);
}

// Helper: Parse A1 notation to extract sheet name and range bounds
function parseA1Range(range: string): {
  sheetName: string;
  startCol: number;
  startRow: number;
  endCol: number;
  endRow: number;
} {
  // Handle "Sheet1!A1:E100" or "A1:E100"
  let sheetName = "";
  let rangeOnly = range;

  if (range.includes("!")) {
    const parts = range.split("!");
    sheetName = parts[0].replace(/^'|'$/g, ""); // Remove quotes if present
    rangeOnly = parts[1];
  }

  // Parse range like "A1:E100" or "A:E" or "A1:E"
  const rangeParts = rangeOnly.split(":");
  const startRef = rangeParts[0];
  const endRef = rangeParts[1] || startRef;

  // Extract column letters and row numbers
  const startMatch = startRef.match(/^([A-Z]+)(\d*)$/i);
  const endMatch = endRef.match(/^([A-Z]+)(\d*)$/i);

  if (!startMatch || !endMatch) {
    throw new Error(`Invalid range format: ${range}`);
  }

  const startCol = columnLetterToIndex(startMatch[1]);
  const endCol = columnLetterToIndex(endMatch[1]);
  const startRow = startMatch[2] ? parseInt(startMatch[2], 10) - 1 : 0;
  const endRow = endMatch[2] ? parseInt(endMatch[2], 10) : 1000; // Default to 1000 rows if not specified

  return { sheetName, startCol, startRow, endCol: endCol + 1, endRow };
}

// Helper: Get sheet ID by name
async function getSheetIdByName(
  sheets: sheets_v4.Sheets,
  spreadsheetId: string,
  sheetName: string
): Promise<number> {
  const response = await sheets.spreadsheets.get({
    spreadsheetId,
    fields: "sheets.properties"
  });

  const sheet = (response.data.sheets || []).find(
    s => s.properties?.title === sheetName
  );

  if (!sheet?.properties?.sheetId) {
    throw new Error(`Sheet "${sheetName}" not found in spreadsheet`);
  }

  return sheet.properties.sheetId;
}

// Helper: Build group rule for pivot table
function buildGroupRule(rule: GroupRuleInput): sheets_v4.Schema$PivotGroupRule {
  if ("date_time" in rule) {
    return { dateTimeRule: { type: rule.date_time.type } };
  }
  if ("histogram" in rule) {
    return {
      histogramRule: {
        interval: rule.histogram.interval,
        start: rule.histogram.start,
        end: rule.histogram.end
      }
    };
  }
  if ("manual" in rule) {
    return {
      manualRule: {
        groups: rule.manual.groups.map(g => ({
          groupName: { stringValue: g.group_name },
          items: g.items.map(item =>
            typeof item === "string"
              ? { stringValue: item }
              : { numberValue: item }
          )
        }))
      }
    };
  }
  throw new Error("Invalid group rule");
}

// Helper: Build pivot group
function buildPivotGroup(group: PivotGroupInput): sheets_v4.Schema$PivotGroup {
  const pivotGroup: sheets_v4.Schema$PivotGroup = {
    sourceColumnOffset: resolveColumnIndex(group.source_column),
    showTotals: group.show_totals
  };

  if (group.label) {
    pivotGroup.label = group.label;
  }

  if (group.sort_order) {
    pivotGroup.sortOrder = group.sort_order;
  }

  // Sort by value (instead of alphabetically)
  if (group.sort_by_value) {
    pivotGroup.valueBucket = {
      valuesIndex: group.sort_by_value.value_index
    };
  } else if (group.sort_order) {
    // Empty valueBucket = sort alphabetically
    pivotGroup.valueBucket = {};
  }

  if (group.group_rule) {
    pivotGroup.groupRule = buildGroupRule(group.group_rule);
  }

  if (group.group_limit) {
    pivotGroup.groupLimit = { countLimit: group.group_limit };
  }

  return pivotGroup;
}

// Helper: Build pivot value
function buildPivotValue(val: PivotValueInput): sheets_v4.Schema$PivotValue {
  const pivotValue: sheets_v4.Schema$PivotValue = {
    summarizeFunction: val.summarize_function
  };

  if (val.source_column !== undefined) {
    pivotValue.sourceColumnOffset = resolveColumnIndex(val.source_column);
  } else if (val.formula) {
    pivotValue.formula = val.formula;
  }

  if (val.name) {
    pivotValue.name = val.name;
  }

  if (val.calculated_display_type) {
    pivotValue.calculatedDisplayType = val.calculated_display_type;
  }

  return pivotValue;
}

// Helper: Build pivot filters
function buildPivotFilters(filters: PivotFilterInput[]): sheets_v4.Schema$PivotFilterSpec[] {
  return filters.map(filter => {
    const spec: sheets_v4.Schema$PivotFilterSpec = {
      columnOffsetIndex: resolveColumnIndex(filter.source_column),
      filterCriteria: {}
    };

    if (filter.visible_values) {
      spec.filterCriteria!.visibleValues = filter.visible_values;
    } else if (filter.condition) {
      spec.filterCriteria!.condition = {
        type: filter.condition.type,
        values: filter.condition.values?.map(v => ({ userEnteredValue: String(v) }))
      };
    }

    return spec;
  });
}

export function registerSheetsTools(server: McpServer): void {
  // Get Spreadsheet metadata
  server.registerTool(
    "sheets_get_spreadsheet",
    {
      title: "Get Google Spreadsheet",
      description: `Retrieve metadata and optionally cell data from a Google Spreadsheet.

Args:
  - spreadsheet_id (string): The ID of the Google Spreadsheet (found in the URL after /d/)
  - include_grid_data (boolean): Whether to include cell data (default: false)
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Spreadsheet title, sheets info, and metadata. For JSON format:
  {
    "spreadsheetId": string,
    "title": string,
    "locale": string,
    "sheets": [{ "sheetId": number, "title": string, "rowCount": number, "columnCount": number }],
    "spreadsheetUrl": string
  }

Examples:
  - Get spreadsheet info: spreadsheet_id="1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms"`,
      inputSchema: GetSpreadsheetSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetSpreadsheetInput) => {
      try {
        const sheets = getSheetsClient();
        const response = await sheets.spreadsheets.get({
          spreadsheetId: params.spreadsheet_id,
          includeGridData: params.include_grid_data
        });

        const spreadsheet = response.data;

        const output = {
          spreadsheetId: spreadsheet.spreadsheetId || params.spreadsheet_id,
          title: spreadsheet.properties?.title || "Untitled",
          locale: spreadsheet.properties?.locale || "en_US",
          sheets: (spreadsheet.sheets || []).map(sheet => ({
            sheetId: sheet.properties?.sheetId,
            title: sheet.properties?.title || "Untitled",
            rowCount: sheet.properties?.gridProperties?.rowCount || 0,
            columnCount: sheet.properties?.gridProperties?.columnCount || 0
          })),
          spreadsheetUrl: spreadsheet.spreadsheetUrl
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const sheetInfo = (spreadsheet.sheets || []).map(formatSheetInfo).join("\n");
          textOutput = [
            `# ${output.title}`,
            "",
            `**Spreadsheet ID**: ${output.spreadsheetId}`,
            `**URL**: ${output.spreadsheetUrl || "N/A"}`,
            `**Locale**: ${output.locale}`,
            "",
            "## Sheets",
            "",
            sheetInfo || "No sheets found"
          ].join("\n");
        } else {
          textOutput = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: textOutput }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );

  // Get cell values
  server.registerTool(
    "sheets_get_values",
    {
      title: "Get Spreadsheet Values",
      description: `Read cell values from a specific range in a Google Spreadsheet.

Args:
  - spreadsheet_id (string): The ID of the Google Spreadsheet
  - range (string): The A1 notation range to read (e.g., 'Sheet1!A1:D10' or 'A1:D10')
  - major_dimension ('ROWS' | 'COLUMNS'): Return data by rows or columns (default: 'ROWS')
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format:
  {
    "range": string,
    "majorDimension": string,
    "values": [[cell values...], ...]
  }

Examples:
  - Read range: spreadsheet_id="...", range="Sheet1!A1:D10"
  - Read specific column: spreadsheet_id="...", range="Sheet1!A:A"`,
      inputSchema: GetValuesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetValuesInput) => {
      try {
        const sheets = getSheetsClient();
        const response = await sheets.spreadsheets.values.get({
          spreadsheetId: params.spreadsheet_id,
          range: params.range,
          majorDimension: params.major_dimension
        });

        const output = {
          range: response.data.range || params.range,
          majorDimension: response.data.majorDimension || params.major_dimension,
          values: response.data.values || []
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          textOutput = formatValuesAsMarkdown(output.values as (string | number | boolean | null)[][], output.range);
          if (textOutput.length > CHARACTER_LIMIT) {
            textOutput = textOutput.substring(0, CHARACTER_LIMIT) + "\n\n[Data truncated...]";
          }
        } else {
          textOutput = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: textOutput }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );

  // Batch get values from multiple ranges
  server.registerTool(
    "sheets_batch_get_values",
    {
      title: "Batch Get Spreadsheet Values",
      description: `Read cell values from multiple ranges in a Google Spreadsheet in a single request.

Args:
  - spreadsheet_id (string): The ID of the Google Spreadsheet
  - ranges (string[]): Array of A1 notation ranges to read (e.g., ['Sheet1!A1:D10', 'Sheet2!A1:B5'])
  - major_dimension ('ROWS' | 'COLUMNS'): Return data by rows or columns (default: 'ROWS')
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format:
  {
    "spreadsheetId": string,
    "valueRanges": [{ "range": string, "values": [[...]] }, ...]
  }

Examples:
  - Read multiple ranges: ranges=["Sheet1!A1:D10", "Sheet2!A:B"]`,
      inputSchema: BatchGetValuesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: BatchGetValuesInput) => {
      try {
        const sheets = getSheetsClient();
        const response = await sheets.spreadsheets.values.batchGet({
          spreadsheetId: params.spreadsheet_id,
          ranges: params.ranges,
          majorDimension: params.major_dimension
        });

        const output = {
          spreadsheetId: response.data.spreadsheetId || params.spreadsheet_id,
          valueRanges: (response.data.valueRanges || []).map(vr => ({
            range: vr.range,
            majorDimension: vr.majorDimension,
            values: vr.values || []
          }))
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const rangeOutputs = output.valueRanges.map(vr =>
            formatValuesAsMarkdown(vr.values as (string | number | boolean | null)[][], vr.range || "Unknown")
          );
          textOutput = rangeOutputs.join("\n\n---\n\n");
          if (textOutput.length > CHARACTER_LIMIT) {
            textOutput = textOutput.substring(0, CHARACTER_LIMIT) + "\n\n[Data truncated...]";
          }
        } else {
          textOutput = JSON.stringify(output, null, 2);
        }

        return {
          content: [{ type: "text", text: textOutput }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );

  // Update cell values
  server.registerTool(
    "sheets_update_values",
    {
      title: "Update Spreadsheet Values",
      description: `Write cell values to a specific range in a Google Spreadsheet.

Args:
  - spreadsheet_id (string): The ID of the Google Spreadsheet
  - range (string): The A1 notation range to update (e.g., 'Sheet1!A1:D10')
  - values (array): 2D array of values to write (rows of cells)
  - value_input_option ('RAW' | 'USER_ENTERED'): How to interpret input (default: 'USER_ENTERED')
    - 'RAW': Values are stored as-is
    - 'USER_ENTERED': Values are parsed as if typed by user (formulas, dates work)

Returns:
  {
    "spreadsheetId": string,
    "updatedRange": string,
    "updatedRows": number,
    "updatedColumns": number,
    "updatedCells": number
  }

Examples:
  - Write data: range="Sheet1!A1", values=[["Name", "Age"], ["Alice", 30]]
  - Write formula: range="Sheet1!C1", values=[["=SUM(A1:B1)"]]`,
      inputSchema: UpdateValuesSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: UpdateValuesInput) => {
      try {
        const sheets = getSheetsClient();
        const response = await sheets.spreadsheets.values.update({
          spreadsheetId: params.spreadsheet_id,
          range: params.range,
          valueInputOption: params.value_input_option,
          requestBody: {
            values: params.values
          }
        });

        const output = {
          spreadsheetId: response.data.spreadsheetId || params.spreadsheet_id,
          updatedRange: response.data.updatedRange || params.range,
          updatedRows: response.data.updatedRows || 0,
          updatedColumns: response.data.updatedColumns || 0,
          updatedCells: response.data.updatedCells || 0
        };

        return {
          content: [{
            type: "text",
            text: `Values updated successfully.\n\n**Range**: ${output.updatedRange}\n**Cells updated**: ${output.updatedCells} (${output.updatedRows} rows × ${output.updatedColumns} columns)`
          }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );

  // Append values
  server.registerTool(
    "sheets_append_values",
    {
      title: "Append Spreadsheet Values",
      description: `Append rows of data to the end of a table in a Google Spreadsheet.

Args:
  - spreadsheet_id (string): The ID of the Google Spreadsheet
  - range (string): The A1 notation range defining the table to append to (e.g., 'Sheet1!A:D')
  - values (array): 2D array of values to append (rows of cells)
  - value_input_option ('RAW' | 'USER_ENTERED'): How to interpret input (default: 'USER_ENTERED')
  - insert_data_option ('OVERWRITE' | 'INSERT_ROWS'): How to insert data (default: 'INSERT_ROWS')

Returns:
  {
    "spreadsheetId": string,
    "tableRange": string,
    "updates": { "updatedRange": string, "updatedRows": number, "updatedCells": number }
  }

Examples:
  - Append rows: range="Sheet1!A:D", values=[["Alice", 30, "Engineer", "NYC"]]`,
      inputSchema: AppendValuesSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: AppendValuesInput) => {
      try {
        const sheets = getSheetsClient();
        const response = await sheets.spreadsheets.values.append({
          spreadsheetId: params.spreadsheet_id,
          range: params.range,
          valueInputOption: params.value_input_option,
          insertDataOption: params.insert_data_option,
          requestBody: {
            values: params.values
          }
        });

        const updates = response.data.updates;
        const output = {
          spreadsheetId: response.data.spreadsheetId || params.spreadsheet_id,
          tableRange: response.data.tableRange || params.range,
          updates: {
            updatedRange: updates?.updatedRange || "",
            updatedRows: updates?.updatedRows || 0,
            updatedColumns: updates?.updatedColumns || 0,
            updatedCells: updates?.updatedCells || 0
          }
        };

        return {
          content: [{
            type: "text",
            text: `Data appended successfully.\n\n**Table range**: ${output.tableRange}\n**Appended to**: ${output.updates.updatedRange}\n**Rows added**: ${output.updates.updatedRows}`
          }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );

  // Create new spreadsheet
  server.registerTool(
    "sheets_create_spreadsheet",
    {
      title: "Create Google Spreadsheet",
      description: `Create a new Google Spreadsheet with optional sheet names.

Args:
  - title (string): The title for the new spreadsheet
  - sheet_titles (string[], optional): Array of sheet names to create

Returns:
  {
    "spreadsheetId": string,
    "title": string,
    "spreadsheetUrl": string,
    "sheets": [{ "sheetId": number, "title": string }]
  }

Examples:
  - Create basic: title="My Spreadsheet"
  - With sheets: title="Budget", sheet_titles=["Income", "Expenses", "Summary"]`,
      inputSchema: CreateSpreadsheetSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: CreateSpreadsheetInput) => {
      try {
        const sheets = getSheetsClient();

        const requestBody: sheets_v4.Schema$Spreadsheet = {
          properties: {
            title: params.title
          }
        };

        if (params.sheet_titles && params.sheet_titles.length > 0) {
          requestBody.sheets = params.sheet_titles.map((title, index) => ({
            properties: {
              sheetId: index,
              title: title
            }
          }));
        }

        const response = await sheets.spreadsheets.create({
          requestBody
        });

        const spreadsheet = response.data;
        const output = {
          spreadsheetId: spreadsheet.spreadsheetId,
          title: spreadsheet.properties?.title || params.title,
          spreadsheetUrl: spreadsheet.spreadsheetUrl,
          sheets: (spreadsheet.sheets || []).map(s => ({
            sheetId: s.properties?.sheetId,
            title: s.properties?.title
          }))
        };

        return {
          content: [{
            type: "text",
            text: `Spreadsheet created successfully.\n\n**Title**: ${output.title}\n**ID**: ${output.spreadsheetId}\n**URL**: ${output.spreadsheetUrl}\n**Sheets**: ${output.sheets.map(s => s.title).join(", ")}`
          }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );

  // Batch update (formatting, charts, etc.)
  server.registerTool(
    "sheets_batch_update",
    {
      title: "Batch Update Spreadsheet",
      description: `Apply batch updates to a Google Spreadsheet (formatting, charts, filters, conditional formatting, etc.).

Args:
  - spreadsheet_id (string): The ID of the Google Spreadsheet to update
  - requests (array): Array of batch update request objects

Common request types:
  - updateCells: Update cell data and formatting
  - addSheet: Add a new sheet
  - deleteSheet: Delete a sheet
  - updateSheetProperties: Rename sheet, change grid size
  - mergeCells: Merge cell ranges
  - addConditionalFormatRule: Add conditional formatting
  - addChart: Add a chart
  - setDataValidation: Add data validation rules
  - addFilterView: Add filter views
  - repeatCell: Apply formatting to a range

See Google Sheets API batchUpdate documentation for full request schema.

Returns:
  {
    "spreadsheetId": string,
    "replies": array
  }

Examples:
  - Add sheet: requests=[{ "addSheet": { "properties": { "title": "NewSheet" } } }]
  - Bold range: requests=[{ "repeatCell": { "range": {...}, "cell": { "userEnteredFormat": { "textFormat": { "bold": true } } }, "fields": "userEnteredFormat.textFormat.bold" } }]`,
      inputSchema: BatchUpdateSpreadsheetSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: BatchUpdateSpreadsheetInput) => {
      try {
        const sheets = getSheetsClient();
        const response = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: params.spreadsheet_id,
          requestBody: {
            requests: params.requests as sheets_v4.Schema$Request[]
          }
        });

        const output = {
          spreadsheetId: response.data.spreadsheetId || params.spreadsheet_id,
          replies: response.data.replies || []
        };

        return {
          content: [{
            type: "text",
            text: `Batch update applied successfully to spreadsheet ${output.spreadsheetId}.\n\n${output.replies.length} operation(s) completed.`
          }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );

  // Clear values
  server.registerTool(
    "sheets_clear_values",
    {
      title: "Clear Spreadsheet Values",
      description: `Clear cell values from a specific range in a Google Spreadsheet (keeps formatting).

Args:
  - spreadsheet_id (string): The ID of the Google Spreadsheet
  - range (string): The A1 notation range to clear (e.g., 'Sheet1!A1:D10')

Returns:
  {
    "spreadsheetId": string,
    "clearedRange": string
  }

Examples:
  - Clear range: range="Sheet1!A1:D10"
  - Clear entire sheet: range="Sheet1"`,
      inputSchema: ClearValuesSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ClearValuesInput) => {
      try {
        const sheets = getSheetsClient();
        const response = await sheets.spreadsheets.values.clear({
          spreadsheetId: params.spreadsheet_id,
          range: params.range
        });

        const output = {
          spreadsheetId: response.data.spreadsheetId || params.spreadsheet_id,
          clearedRange: response.data.clearedRange || params.range
        };

        return {
          content: [{
            type: "text",
            text: `Values cleared successfully.\n\n**Cleared range**: ${output.clearedRange}`
          }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );

  server.registerTool(
    "sheets_duplicate_sheet",
    {
      title: "Duplicate Sheet",
      description: `Duplicate a sheet within the same spreadsheet.

Args:
  - spreadsheet_id (string): The ID of the Google Spreadsheet
  - sheet_id (number): The ID of the sheet to duplicate (use sheets_get_spreadsheet to find sheet IDs)
  - new_sheet_name (string, optional): Name for the new sheet (defaults to 'Copy of [original name]')

Returns:
  {
    "sheetId": number,
    "title": string,
    "index": number
  }

Examples:
  - Duplicate sheet: spreadsheet_id="...", sheet_id=0
  - Duplicate with new name: spreadsheet_id="...", sheet_id=0, new_sheet_name="January Data"`,
      inputSchema: DuplicateSheetSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: DuplicateSheetInput) => {
      try {
        const sheets = getSheetsClient();

        const request: sheets_v4.Schema$DuplicateSheetRequest = {
          sourceSheetId: params.sheet_id
        };

        if (params.new_sheet_name) {
          request.newSheetName = params.new_sheet_name;
        }

        const response = await sheets.spreadsheets.batchUpdate({
          spreadsheetId: params.spreadsheet_id,
          requestBody: {
            requests: [{ duplicateSheet: request }]
          }
        });

        const reply = response.data.replies?.[0]?.duplicateSheet?.properties;

        const output = {
          sheetId: reply?.sheetId,
          title: reply?.title || params.new_sheet_name || "Copy",
          index: reply?.index || 0
        };

        return {
          content: [{
            type: "text",
            text: `Sheet duplicated successfully.\n\n**New Sheet Name**: ${output.title}\n**Sheet ID**: ${output.sheetId}`
          }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );

  server.registerTool(
    "sheets_create_pivot_table",
    {
      title: "Create Pivot Table",
      description: `Create a pivot table from spreadsheet data with full Google Sheets UI feature support.

Args:
  - spreadsheet_id (string): The ID of the Google Spreadsheet
  - source_range (string): A1 notation range (e.g., 'Sheet1!A1:E100', 'Sales!A:F')
  - destination_sheet_id (number, optional): Sheet ID for pivot (default: creates new sheet)
  - destination_sheet_name (string): Name for new sheet (default: 'Pivot Table')

  - rows/columns (array): Groupings (at least one row OR column required)
    - source_column: Column letter ('A') or index (0)
    - label: Custom display name
    - show_totals: Show subtotals (default: true)
    - sort_order: 'ASCENDING' or 'DESCENDING'
    - sort_by_value: { value_index: 0 } - Sort by aggregated value instead of alphabetically
    - group_rule: Bucketing options (pick one):
      - { date_time: { type: 'MONTH' } } - Group dates (YEAR, QUARTER, MONTH, DAY_OF_WEEK, etc.)
      - { histogram: { interval: 100, start: 0, end: 1000 } } - Numeric buckets
      - { manual: { groups: [{ group_name: 'West', items: ['CA', 'WA', 'OR'] }] } }
    - group_limit: Max groups to display

  - values (array, required): Aggregations
    - source_column: Column to aggregate (or use formula)
    - formula: Custom formula like '=Revenue/Quantity' (use with summarize_function: 'CUSTOM')
    - summarize_function: SUM, COUNT, COUNTA, COUNTUNIQUE, AVERAGE, MAX, MIN, MEDIAN, PRODUCT, STDEV, STDEVP, VAR, VARP, CUSTOM
    - name: Display name
    - calculated_display_type: 'PERCENT_OF_ROW_TOTAL', 'PERCENT_OF_COLUMN_TOTAL', 'PERCENT_OF_GRAND_TOTAL'

  - filters (array, optional): Filter source data
    - source_column: Column to filter
    - visible_values: ['Active', 'Pending'] - Show only these values
    - condition: { type: 'NUMBER_GREATER', values: [100] } - Filter by condition

  - value_layout: 'HORIZONTAL' or 'VERTICAL' (default: 'HORIZONTAL')

Examples:
  - Date grouped: rows=[{source_column: "A", group_rule: {date_time: {type: "MONTH"}}}], values=[{source_column: "E", summarize_function: "SUM"}]
  - Sorted by value: rows=[{source_column: "A", sort_by_value: {value_index: 0}, sort_order: "DESCENDING"}], values=[{source_column: "E", summarize_function: "SUM"}]
  - Filtered: filters=[{source_column: "B", visible_values: ["Active"]}], rows=[{source_column: "A"}], values=[{source_column: "E", summarize_function: "SUM"}]
  - Percentage: values=[{source_column: "E", summarize_function: "SUM", calculated_display_type: "PERCENT_OF_GRAND_TOTAL"}]`,
      inputSchema: CreatePivotTableSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: CreatePivotTableInput) => {
      try {
        const sheets = getSheetsClient();

        // Parse the source range
        const parsedRange = parseA1Range(params.source_range);

        // Get the source sheet ID
        let sourceSheetId: number;
        if (parsedRange.sheetName) {
          sourceSheetId = await getSheetIdByName(sheets, params.spreadsheet_id, parsedRange.sheetName);
        } else {
          const spreadsheet = await sheets.spreadsheets.get({
            spreadsheetId: params.spreadsheet_id,
            fields: "sheets.properties"
          });
          sourceSheetId = spreadsheet.data.sheets?.[0]?.properties?.sheetId || 0;
        }

        // Determine destination sheet ID
        let destinationSheetId = params.destination_sheet_id;
        let destinationSheetName = params.destination_sheet_name;

        // If no destination sheet ID provided, create a new sheet first
        if (destinationSheetId === undefined) {
          const addSheetResponse = await sheets.spreadsheets.batchUpdate({
            spreadsheetId: params.spreadsheet_id,
            requestBody: {
              requests: [{
                addSheet: {
                  properties: {
                    title: destinationSheetName
                  }
                }
              }]
            }
          });

          const newSheetId = addSheetResponse.data.replies?.[0]?.addSheet?.properties?.sheetId;
          destinationSheetName = addSheetResponse.data.replies?.[0]?.addSheet?.properties?.title || destinationSheetName;

          if (newSheetId === undefined || newSheetId === null) {
            throw new Error("Failed to create destination sheet");
          }
          destinationSheetId = newSheetId;
        }

        // Build pivot groups using helper functions
        const pivotRows = (params.rows || []).map(buildPivotGroup);
        const pivotColumns = (params.columns || []).map(buildPivotGroup);
        const pivotValues = params.values.map(buildPivotValue);
        const pivotFilters = params.filters ? buildPivotFilters(params.filters) : undefined;

        // Build the pivot table object
        const pivotTable: sheets_v4.Schema$PivotTable = {
          source: {
            sheetId: sourceSheetId,
            startRowIndex: parsedRange.startRow,
            startColumnIndex: parsedRange.startCol,
            endRowIndex: parsedRange.endRow,
            endColumnIndex: parsedRange.endCol
          },
          rows: pivotRows.length > 0 ? pivotRows : undefined,
          columns: pivotColumns.length > 0 ? pivotColumns : undefined,
          values: pivotValues,
          valueLayout: params.value_layout,
          filterSpecs: pivotFilters
        };

        // Create the pivot table
        await sheets.spreadsheets.batchUpdate({
          spreadsheetId: params.spreadsheet_id,
          requestBody: {
            requests: [{
              updateCells: {
                rows: [{
                  values: [{ pivotTable }]
                }],
                start: {
                  sheetId: destinationSheetId,
                  rowIndex: 0,
                  columnIndex: 0
                },
                fields: "pivotTable"
              }
            }]
          }
        });

        const output = {
          spreadsheetId: params.spreadsheet_id,
          pivotTableSheetId: destinationSheetId,
          pivotTableSheetName: destinationSheetName,
          sourceRange: params.source_range,
          rowGroups: pivotRows.length,
          columnGroups: pivotColumns.length,
          valueAggregations: pivotValues.length,
          filters: params.filters?.length || 0
        };

        return {
          content: [{
            type: "text",
            text: `Pivot table created successfully.\n\n**Sheet**: ${output.pivotTableSheetName} (ID: ${output.pivotTableSheetId})\n**Source**: ${output.sourceRange}\n**Row Groups**: ${output.rowGroups}\n**Column Groups**: ${output.columnGroups}\n**Values**: ${output.valueAggregations}\n**Filters**: ${output.filters}`
          }],
          structuredContent: output
        };
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );
}
