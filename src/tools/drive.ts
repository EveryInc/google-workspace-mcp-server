import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getDriveClient, handleGoogleError } from "../services/google-auth.js";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  ListCommentsSchema,
  CreateCommentSchema,
  ReplyToCommentSchema,
  ResolveCommentSchema,
  DeleteCommentSchema,
  ListFilesSchema,
  SearchFilesSchema,
  GetFileSchema,
  CopyFileSchema,
  type ListCommentsInput,
  type CreateCommentInput,
  type ReplyToCommentInput,
  type ResolveCommentInput,
  type DeleteCommentInput,
  type ListFilesInput,
  type SearchFilesInput,
  type GetFileInput,
  type CopyFileInput
} from "../schemas/drive.js";
import { ResponseFormat } from "../constants.js";
import type { CommentData, ReplyData, FileData } from "../types.js";

const MIME_TYPE_MAP: Record<string, string> = {
  documents: "application/vnd.google-apps.document",
  spreadsheets: "application/vnd.google-apps.spreadsheet",
  presentations: "application/vnd.google-apps.presentation",
  folders: "application/vnd.google-apps.folder"
};

const MIME_TYPE_DISPLAY: Record<string, string> = {
  "application/vnd.google-apps.document": "Google Doc",
  "application/vnd.google-apps.spreadsheet": "Google Sheet",
  "application/vnd.google-apps.presentation": "Google Slides",
  "application/vnd.google-apps.folder": "Folder",
  "application/vnd.google-apps.form": "Google Form",
  "application/pdf": "PDF",
  "image/png": "PNG Image",
  "image/jpeg": "JPEG Image"
};

function formatFileForMarkdown(file: FileData): string {
  const typeDisplay = MIME_TYPE_DISPLAY[file.mimeType] || file.mimeType;
  const lines: string[] = [
    `### ${file.name}`,
    `- **ID**: \`${file.id}\``,
    `- **Type**: ${typeDisplay}`
  ];

  if (file.modifiedTime) {
    lines.push(`- **Modified**: ${file.modifiedTime}`);
  }
  if (file.size) {
    lines.push(`- **Size**: ${formatFileSize(Number(file.size))}`);
  }
  if (file.webViewLink) {
    lines.push(`- **Link**: ${file.webViewLink}`);
  }
  if (file.owners && file.owners.length > 0) {
    lines.push(`- **Owner**: ${file.owners.join(", ")}`);
  }

  return lines.join("\n");
}

function formatFileSize(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  return `${(bytes / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

function formatCommentForMarkdown(comment: CommentData): string {
  const lines: string[] = [
    `### Comment by ${comment.author}`,
    `**ID**: ${comment.id}`,
    `**Created**: ${comment.createdTime}`,
    `**Status**: ${comment.resolved ? "Resolved" : "Open"}`,
  ];

  if (comment.quotedFileContent) {
    lines.push(`**Quoted Text**: "${comment.quotedFileContent}"`);
  }

  lines.push("", comment.content);

  if (comment.replies.length > 0) {
    lines.push("", "**Replies**:");
    for (const reply of comment.replies) {
      lines.push(`- **${reply.author}** (${reply.createdTime}): ${reply.content}`);
    }
  }

  return lines.join("\n");
}

export function registerDriveTools(server: McpServer): void {
  server.registerTool(
    "drive_list_comments",
    {
      title: "List Document Comments",
      description: `List comments on a Google Doc.

Args:
  - file_id (string): The ID of the Google Doc
  - include_deleted (boolean): Include deleted comments (default: false)
  - page_size (number): Max comments to return, 1-100 (default: 20)
  - page_token (string, optional): Pagination token for next page
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format:
  {
    "comments": [
      {
        "id": string,
        "content": string,
        "author": string,
        "createdTime": string,
        "resolved": boolean,
        "quotedFileContent": string,
        "replies": [{ "id", "content", "author", "createdTime" }]
      }
    ],
    "next_page_token": string | null
  }`,
      inputSchema: ListCommentsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListCommentsInput) => {
      try {
        const drive = getDriveClient();

        const response = await drive.comments.list({
          fileId: params.file_id,
          includeDeleted: params.include_deleted,
          pageSize: params.page_size,
          pageToken: params.page_token,
          fields: "comments(id,content,author,createdTime,modifiedTime,resolved,quotedFileContent,replies),nextPageToken"
        });

        const comments: CommentData[] = (response.data.comments || []).map(c => ({
          id: c.id || "",
          content: c.content || "",
          author: c.author?.displayName || "Unknown",
          createdTime: c.createdTime || "",
          modifiedTime: c.modifiedTime,
          resolved: c.resolved || false,
          quotedFileContent: c.quotedFileContent?.value,
          replies: (c.replies || []).map(r => ({
            id: r.id || "",
            content: r.content || "",
            author: r.author?.displayName || "Unknown",
            createdTime: r.createdTime || ""
          }))
        }));

        const output = {
          comments,
          next_page_token: response.data.nextPageToken || null
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          if (comments.length === 0) {
            textOutput = "No comments found on this document.";
          } else {
            const lines = [
              `# Comments on Document`,
              "",
              `Found ${comments.length} comment(s)${output.next_page_token ? " (more available)" : ""}.`,
              ""
            ];
            for (const comment of comments) {
              lines.push(formatCommentForMarkdown(comment), "---", "");
            }
            if (output.next_page_token) {
              lines.push(`*Use page_token="${output.next_page_token}" to load more comments.*`);
            }
            textOutput = lines.join("\n");
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

  server.registerTool(
    "drive_create_comment",
    {
      title: "Create Comment on Document",
      description: `Add a comment to a Google Doc. Can be anchored to specific text or unanchored.

Args:
  - file_id (string): The ID of the Google Doc
  - content (string): The text content of the comment
  - quoted_text (string, optional): Text to anchor the comment to (for anchored comments)

Returns:
  {
    "id": string,
    "content": string,
    "author": string,
    "createdTime": string
  }

Examples:
  - Unanchored: file_id="...", content="Please review this section"
  - Anchored: file_id="...", content="Typo here", quoted_text="teh"`,
      inputSchema: CreateCommentSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: CreateCommentInput) => {
      try {
        const drive = getDriveClient();

        const requestBody: Record<string, unknown> = {
          content: params.content
        };

        if (params.quoted_text) {
          requestBody.quotedFileContent = {
            value: params.quoted_text
          };
        }

        const response = await drive.comments.create({
          fileId: params.file_id,
          fields: "id,content,author,createdTime",
          requestBody
        });

        const output = {
          id: response.data.id || "",
          content: response.data.content || params.content,
          author: response.data.author?.displayName || "You",
          createdTime: response.data.createdTime || new Date().toISOString()
        };

        return {
          content: [{
            type: "text",
            text: `Comment created successfully.\n\n**ID**: ${output.id}\n**Author**: ${output.author}\n**Content**: ${output.content}`
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
    "drive_reply_to_comment",
    {
      title: "Reply to Comment",
      description: `Reply to an existing comment on a Google Doc.

Args:
  - file_id (string): The ID of the Google Doc
  - comment_id (string): The ID of the comment to reply to
  - content (string): The text content of the reply

Returns:
  {
    "id": string,
    "content": string,
    "author": string,
    "createdTime": string
  }`,
      inputSchema: ReplyToCommentSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: ReplyToCommentInput) => {
      try {
        const drive = getDriveClient();

        const response = await drive.replies.create({
          fileId: params.file_id,
          commentId: params.comment_id,
          fields: "id,content,author,createdTime",
          requestBody: {
            content: params.content
          }
        });

        const output = {
          id: response.data.id || "",
          content: response.data.content || params.content,
          author: response.data.author?.displayName || "You",
          createdTime: response.data.createdTime || new Date().toISOString()
        };

        return {
          content: [{
            type: "text",
            text: `Reply created successfully.\n\n**Reply ID**: ${output.id}\n**Comment ID**: ${params.comment_id}\n**Content**: ${output.content}`
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
    "drive_resolve_comment",
    {
      title: "Resolve Comment",
      description: `Mark a comment as resolved on a Google Doc.

Args:
  - file_id (string): The ID of the Google Doc
  - comment_id (string): The ID of the comment to resolve

Returns:
  {
    "id": string,
    "resolved": true
  }`,
      inputSchema: ResolveCommentSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ResolveCommentInput) => {
      try {
        const drive = getDriveClient();

        await drive.comments.update({
          fileId: params.file_id,
          commentId: params.comment_id,
          fields: "id,resolved",
          requestBody: {
            resolved: true
          }
        });

        const output = {
          id: params.comment_id,
          resolved: true
        };

        return {
          content: [{
            type: "text",
            text: `Comment ${params.comment_id} has been marked as resolved.`
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
    "drive_delete_comment",
    {
      title: "Delete Comment",
      description: `Delete a comment from a Google Doc.

Args:
  - file_id (string): The ID of the Google Doc
  - comment_id (string): The ID of the comment to delete

Returns:
  {
    "deleted": true,
    "comment_id": string
  }

Note: This action cannot be undone.`,
      inputSchema: DeleteCommentSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: DeleteCommentInput) => {
      try {
        const drive = getDriveClient();

        await drive.comments.delete({
          fileId: params.file_id,
          commentId: params.comment_id
        });

        const output = {
          deleted: true,
          comment_id: params.comment_id
        };

        return {
          content: [{
            type: "text",
            text: `Comment ${params.comment_id} has been deleted.`
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
    "drive_list_files",
    {
      title: "List Drive Files",
      description: `List files in your Google Drive.

Args:
  - page_size (number): Max files to return, 1-100 (default: 20)
  - page_token (string, optional): Pagination token for next page
  - order_by (string): Sort order (default: 'modifiedTime desc')
  - mime_type ('all' | 'documents' | 'spreadsheets' | 'presentations' | 'folders'): Filter by type (default: 'all')
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format:
  {
    "files": [
      {
        "id": string,
        "name": string,
        "mimeType": string,
        "createdTime": string,
        "modifiedTime": string,
        "size": string,
        "webViewLink": string,
        "owners": string[]
      }
    ],
    "next_page_token": string | null
  }`,
      inputSchema: ListFilesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListFilesInput) => {
      try {
        const drive = getDriveClient();

        let q = "trashed = false";
        if (params.mime_type !== "all") {
          const mimeType = MIME_TYPE_MAP[params.mime_type];
          if (mimeType) {
            q += ` and mimeType = '${mimeType}'`;
          }
        }

        const response = await drive.files.list({
          q,
          pageSize: params.page_size,
          pageToken: params.page_token,
          orderBy: params.order_by,
          fields: "files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,owners),nextPageToken",
          supportsAllDrives: true,
          includeItemsFromAllDrives: true
        });

        const files: FileData[] = (response.data.files || []).map(f => ({
          id: f.id || "",
          name: f.name || "",
          mimeType: f.mimeType || "",
          createdTime: f.createdTime || undefined,
          modifiedTime: f.modifiedTime || undefined,
          size: f.size || undefined,
          webViewLink: f.webViewLink || undefined,
          owners: f.owners?.map(o => o.displayName || o.emailAddress || "Unknown")
        }));

        const output = {
          files,
          next_page_token: response.data.nextPageToken || null
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          if (files.length === 0) {
            textOutput = "No files found in Drive.";
          } else {
            const lines = [
              `# Drive Files`,
              "",
              `Found ${files.length} file(s)${output.next_page_token ? " (more available)" : ""}.`,
              ""
            ];
            for (const file of files) {
              lines.push(formatFileForMarkdown(file), "");
            }
            if (output.next_page_token) {
              lines.push(`*Use page_token="${output.next_page_token}" to load more files.*`);
            }
            textOutput = lines.join("\n");
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

  server.registerTool(
    "drive_search_files",
    {
      title: "Search Drive Files",
      description: `Search for files in your Google Drive by name or content.

Args:
  - query (string): Search query - searches file names and content
  - page_size (number): Max files to return, 1-100 (default: 20)
  - page_token (string, optional): Pagination token for next page
  - mime_type ('all' | 'documents' | 'spreadsheets' | 'presentations' | 'folders'): Filter by type (default: 'all')
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  For JSON format:
  {
    "files": [
      {
        "id": string,
        "name": string,
        "mimeType": string,
        "createdTime": string,
        "modifiedTime": string,
        "size": string,
        "webViewLink": string,
        "owners": string[]
      }
    ],
    "next_page_token": string | null
  }

Examples:
  - Search by name: query="budget 2024"
  - Search spreadsheets: query="sales", mime_type="spreadsheets"`,
      inputSchema: SearchFilesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: SearchFilesInput) => {
      try {
        const drive = getDriveClient();

        // Build search query - fullText searches name and content
        let q = `trashed = false and fullText contains '${params.query.replace(/'/g, "\\'")}'`;
        if (params.mime_type !== "all") {
          const mimeType = MIME_TYPE_MAP[params.mime_type];
          if (mimeType) {
            q += ` and mimeType = '${mimeType}'`;
          }
        }

        const response = await drive.files.list({
          q,
          pageSize: params.page_size,
          pageToken: params.page_token,
          fields: "files(id,name,mimeType,createdTime,modifiedTime,size,webViewLink,owners),nextPageToken",
          supportsAllDrives: true,
          includeItemsFromAllDrives: true
        });

        const files: FileData[] = (response.data.files || []).map(f => ({
          id: f.id || "",
          name: f.name || "",
          mimeType: f.mimeType || "",
          createdTime: f.createdTime || undefined,
          modifiedTime: f.modifiedTime || undefined,
          size: f.size || undefined,
          webViewLink: f.webViewLink || undefined,
          owners: f.owners?.map(o => o.displayName || o.emailAddress || "Unknown")
        }));

        const output = {
          files,
          next_page_token: response.data.nextPageToken || null
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          if (files.length === 0) {
            textOutput = `No files found matching "${params.query}".`;
          } else {
            const lines = [
              `# Search Results for "${params.query}"`,
              "",
              `Found ${files.length} file(s)${output.next_page_token ? " (more available)" : ""}.`,
              ""
            ];
            for (const file of files) {
              lines.push(formatFileForMarkdown(file), "");
            }
            if (output.next_page_token) {
              lines.push(`*Use page_token="${output.next_page_token}" to load more results.*`);
            }
            textOutput = lines.join("\n");
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

  server.registerTool(
    "drive_get_file",
    {
      title: "Get File Content",
      description: `Download and return the content of a file from Google Drive. Supports PDFs, images, and other binary files.

Args:
  - file_id (string): The ID of the file to download (found in the URL after /d/)

Returns:
  The file content. For PDFs and images, returns the binary content that Claude can read directly.

Examples:
  - Get PDF: file_id="1Q3BmlH3_sII1VGf0-GYXSiLGTZstM-l1"
  - From URL https://drive.google.com/file/d/ABC123/view -> file_id="ABC123"`,
      inputSchema: GetFileSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetFileInput) => {
      try {
        const drive = getDriveClient();

        // First get file metadata to determine type and name
        const metadata = await drive.files.get({
          fileId: params.file_id,
          fields: "id,name,mimeType,size",
          supportsAllDrives: true
        });

        const mimeType = metadata.data.mimeType || "application/octet-stream";
        const fileName = metadata.data.name || "file";
        const fileSize = metadata.data.size ? Number(metadata.data.size) : 0;

        // Check if it's a Google Workspace file that needs export
        const isGoogleWorkspaceFile = mimeType.startsWith("application/vnd.google-apps.");

        let fileContent: Buffer;
        let finalMimeType = mimeType;

        if (isGoogleWorkspaceFile) {
          // Export Google Workspace files to appropriate format
          let exportMimeType: string;
          if (mimeType === "application/vnd.google-apps.document") {
            exportMimeType = "application/pdf";
          } else if (mimeType === "application/vnd.google-apps.spreadsheet") {
            exportMimeType = "application/pdf";
          } else if (mimeType === "application/vnd.google-apps.presentation") {
            exportMimeType = "application/pdf";
          } else {
            exportMimeType = "application/pdf";
          }

          const response = await drive.files.export({
            fileId: params.file_id,
            mimeType: exportMimeType
          }, {
            responseType: "arraybuffer"
          });

          fileContent = Buffer.from(response.data as ArrayBuffer);
          finalMimeType = exportMimeType;
        } else {
          // Download binary files directly
          const response = await drive.files.get({
            fileId: params.file_id,
            alt: "media",
            supportsAllDrives: true
          }, {
            responseType: "arraybuffer"
          });

          fileContent = Buffer.from(response.data as ArrayBuffer);
        }

        const base64Content = fileContent.toString("base64");

        // Return as appropriate content type
        if (finalMimeType === "application/pdf") {
          // Save PDF to temp file so Claude can read it with the Read tool
          const tempDir = os.tmpdir();
          const safeName = fileName.replace(/[^a-zA-Z0-9.-]/g, "_");
          const tempPath = path.join(tempDir, `gdrive_${Date.now()}_${safeName}`);
          fs.writeFileSync(tempPath, fileContent);

          return {
            content: [
              {
                type: "text",
                text: `File: ${fileName}\nType: ${finalMimeType}\nSize: ${formatFileSize(fileContent.length)}\n\nPDF saved to: ${tempPath}\n\nUse the Read tool to read this file.`
              }
            ]
          };
        } else if (finalMimeType.startsWith("image/")) {
          return {
            content: [
              {
                type: "text",
                text: `File: ${fileName}\nType: ${finalMimeType}\nSize: ${formatFileSize(fileContent.length)}`
              },
              {
                type: "image",
                data: base64Content,
                mimeType: finalMimeType
              }
            ]
          };
        } else {
          // For other files, try to return as text if possible
          try {
            const textContent = fileContent.toString("utf-8");
            return {
              content: [
                {
                  type: "text",
                  text: `File: ${fileName}\nType: ${finalMimeType}\nSize: ${formatFileSize(fileContent.length)}\n\n---\n\n${textContent}`
                }
              ]
            };
          } catch {
            // If not text, return as base64
            return {
              content: [
                {
                  type: "text",
                  text: `File: ${fileName}\nType: ${finalMimeType}\nSize: ${formatFileSize(fileContent.length)}\n\nBinary file downloaded. Base64 content available.`
                },
                {
                  type: "resource",
                  resource: {
                    uri: `data:${finalMimeType};base64,${base64Content}`,
                    mimeType: finalMimeType,
                    blob: base64Content
                  }
                }
              ]
            };
          }
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );

  server.registerTool(
    "drive_copy_file",
    {
      title: "Copy Drive File",
      description: `Create a copy of a file in Google Drive.

Args:
  - file_id (string): The ID of the file to copy
  - name (string, optional): New name for the copied file (defaults to 'Copy of [original name]')
  - parent_folder_id (string, optional): ID of the folder to copy the file into (defaults to same location as original)

Returns:
  {
    "id": string,
    "name": string,
    "mimeType": string,
    "webViewLink": string
  }

Examples:
  - Copy file: file_id="1abc123"
  - Copy with new name: file_id="1abc123", name="Budget 2025"
  - Copy to folder: file_id="1abc123", parent_folder_id="0xyz789"`,
      inputSchema: CopyFileSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: CopyFileInput) => {
      try {
        const drive = getDriveClient();

        const requestBody: { name?: string; parents?: string[] } = {};

        if (params.name) {
          requestBody.name = params.name;
        }
        if (params.parent_folder_id) {
          requestBody.parents = [params.parent_folder_id];
        }

        const response = await drive.files.copy({
          fileId: params.file_id,
          fields: "id,name,mimeType,webViewLink",
          requestBody,
          supportsAllDrives: true
        });

        const output = {
          id: response.data.id || "",
          name: response.data.name || "",
          mimeType: response.data.mimeType || "",
          webViewLink: response.data.webViewLink || ""
        };

        const typeDisplay = MIME_TYPE_DISPLAY[output.mimeType] || output.mimeType;

        return {
          content: [{
            type: "text",
            text: `File copied successfully.\n\n**Name**: ${output.name}\n**ID**: ${output.id}\n**Type**: ${typeDisplay}\n**Link**: ${output.webViewLink}`
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
