#!/usr/bin/env node
/**
 * MCP Server for Google Workspace.
 *
 * This server provides tools to interact with Google Docs API, Google Drive
 * Comments API, and Google Sheets API, enabling document creation, editing,
 * spreadsheet operations, and comment management.
 */

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { initializeGoogleAuth } from "./services/google-auth.js";
import { registerDocsTools } from "./tools/docs.js";
import { registerDriveTools } from "./tools/drive.js";
import { registerSheetsTools } from "./tools/sheets.js";
import { registerGmailTools } from "./tools/gmail.js";
import { registerCalendarTools } from "./tools/calendar.js";

const server = new McpServer({
  name: "google-workspace-mcp-server",
  version: "1.2.0"
});

registerDocsTools(server);
registerDriveTools(server);
registerSheetsTools(server);
registerGmailTools(server);
registerCalendarTools(server);

async function main(): Promise<void> {
  try {
    initializeGoogleAuth();
  } catch (error) {
    console.error("ERROR:", error instanceof Error ? error.message : String(error));
    process.exit(1);
  }

  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("Google Workspace MCP server running via stdio");
}

main().catch(error => {
  console.error("Server error:", error);
  process.exit(1);
});
