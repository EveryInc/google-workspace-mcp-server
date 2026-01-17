import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import type { gmail_v1 } from "googleapis";
import { getGmailClient, handleGoogleError } from "../services/google-auth.js";
import {
  ListMessagesSchema,
  GetMessageSchema,
  ListThreadsSchema,
  GetThreadSchema,
  ListLabelsSchema,
  CreateDraftSchema,
  GetAttachmentSchema,
  ListAttachmentsSchema,
  type ListMessagesInput,
  type GetMessageInput,
  type ListThreadsInput,
  type GetThreadInput,
  type ListLabelsInput,
  type CreateDraftInput,
  type GetAttachmentInput,
  type ListAttachmentsInput
} from "../schemas/gmail.js";
import { ResponseFormat } from "../constants.js";
import type { MessageData, ThreadData, LabelData } from "../types.js";

function getHeader(headers: gmail_v1.Schema$MessagePartHeader[] | undefined, name: string): string | undefined {
  const value = headers?.find(h => h.name?.toLowerCase() === name.toLowerCase())?.value;
  return value ?? undefined;
}

function decodeBase64(data: string): string {
  return Buffer.from(data.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf-8");
}

function extractBody(payload: gmail_v1.Schema$MessagePart | undefined): string {
  if (!payload) return "";

  if (payload.body?.data) {
    return decodeBase64(payload.body.data);
  }

  if (payload.parts) {
    // Prefer plain text
    for (const part of payload.parts) {
      if (part.mimeType === "text/plain" && part.body?.data) {
        return decodeBase64(part.body.data);
      }
    }
    // Fall back to HTML stripped
    for (const part of payload.parts) {
      if (part.mimeType === "text/html" && part.body?.data) {
        const html = decodeBase64(part.body.data);
        return html.replace(/<[^>]*>/g, "").replace(/\s+/g, " ").trim();
      }
    }
    // Recurse into nested parts
    for (const part of payload.parts) {
      const nested = extractBody(part);
      if (nested) return nested;
    }
  }

  return "";
}

function formatMessageForMarkdown(msg: MessageData): string {
  const lines = [
    `### ${msg.subject || "(no subject)"}`,
    `- **From**: ${msg.from || "Unknown"}`,
    `- **To**: ${msg.to || "Unknown"}`,
    `- **Date**: ${msg.date || "Unknown"}`,
    `- **ID**: \`${msg.id}\``
  ];

  if (msg.labels && msg.labels.length > 0) {
    lines.push(`- **Labels**: ${msg.labels.join(", ")}`);
  }

  if (msg.snippet) {
    lines.push(`- **Preview**: ${msg.snippet}`);
  }

  return lines.join("\n");
}

export function registerGmailTools(server: McpServer): void {
  server.registerTool(
    "gmail_list_messages",
    {
      title: "List Gmail Messages",
      description: `List messages from Gmail with optional search filters.

Args:
  - query (string, optional): Gmail search query (e.g., 'from:boss@company.com is:unread', 'subject:invoice after:2024/01/01')
  - max_results (number): Maximum messages to return, 1-100 (default: 10)
  - label_ids (string[]): Filter by labels like 'INBOX', 'UNREAD', 'STARRED', 'SENT'
  - page_token (string, optional): Token for pagination
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of message summaries with ID, subject, from, date, and snippet.

Examples:
  - Unread emails: query="is:unread"
  - From specific sender: query="from:notifications@github.com"
  - Recent with attachment: query="has:attachment newer_than:7d"`,
      inputSchema: ListMessagesSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListMessagesInput) => {
      try {
        const gmail = getGmailClient();

        // Build params object, only including defined values
        const listParams: {
          userId: string;
          maxResults: number;
          q?: string;
          labelIds?: string[];
          pageToken?: string;
        } = {
          userId: "me",
          maxResults: params.max_results
        };

        if (params.query) {
          listParams.q = params.query;
        }
        if (params.label_ids && params.label_ids.length > 0) {
          listParams.labelIds = params.label_ids;
        }
        if (params.page_token) {
          listParams.pageToken = params.page_token;
        }

        const response = await gmail.users.messages.list(listParams);

        const messageIds = response.data.messages || [];

        // Fetch details for each message
        const messages: MessageData[] = await Promise.all(
          messageIds.map(async (msg) => {
            const detail = await gmail.users.messages.get({
              userId: "me",
              id: msg.id!,
              format: "metadata",
              metadataHeaders: ["From", "To", "Subject", "Date"]
            });

            const headers = detail.data.payload?.headers;
            return {
              id: msg.id || "",
              threadId: msg.threadId || "",
              from: getHeader(headers, "From"),
              to: getHeader(headers, "To"),
              subject: getHeader(headers, "Subject"),
              date: getHeader(headers, "Date"),
              snippet: detail.data.snippet || "",
              labels: detail.data.labelIds || []
            };
          })
        );

        const output = {
          messages,
          result_count: messages.length,
          next_page_token: response.data.nextPageToken || null
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          if (messages.length === 0) {
            textOutput = params.query
              ? `No messages found matching "${params.query}".`
              : "No messages found.";
          } else {
            const lines = [
              "# Gmail Messages",
              "",
              `Found ${messages.length} message(s)${output.next_page_token ? " (more available)" : ""}.`,
              ""
            ];
            for (const msg of messages) {
              lines.push(formatMessageForMarkdown(msg), "");
            }
            if (output.next_page_token) {
              lines.push(`*Use page_token="${output.next_page_token}" to load more messages.*`);
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
    "gmail_get_message",
    {
      title: "Get Gmail Message",
      description: `Get the full content of a specific Gmail message.

Args:
  - message_id (string): The message ID to retrieve
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Full message content including headers and body text.`,
      inputSchema: GetMessageSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetMessageInput) => {
      try {
        const gmail = getGmailClient();

        const response = await gmail.users.messages.get({
          userId: "me",
          id: params.message_id,
          format: "full"
        });

        const headers = response.data.payload?.headers;
        const body = extractBody(response.data.payload);

        const output = {
          id: response.data.id || "",
          threadId: response.data.threadId || "",
          from: getHeader(headers, "From"),
          to: getHeader(headers, "To"),
          cc: getHeader(headers, "Cc"),
          subject: getHeader(headers, "Subject"),
          date: getHeader(headers, "Date"),
          labels: response.data.labelIds || [],
          body
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          textOutput = [
            `# ${output.subject || "(no subject)"}`,
            "",
            `**From**: ${output.from || "Unknown"}`,
            `**To**: ${output.to || "Unknown"}`,
            output.cc ? `**CC**: ${output.cc}` : null,
            `**Date**: ${output.date || "Unknown"}`,
            `**Labels**: ${output.labels.join(", ") || "None"}`,
            "",
            "---",
            "",
            output.body || "(no body content)"
          ].filter(line => line !== null).join("\n");
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
    "gmail_list_threads",
    {
      title: "List Gmail Threads",
      description: `List conversation threads from Gmail.

Args:
  - query (string, optional): Gmail search query to filter threads
  - max_results (number): Maximum threads to return, 1-100 (default: 10)
  - label_ids (string[]): Filter by labels
  - page_token (string, optional): Token for pagination
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of threads with message count and snippet.`,
      inputSchema: ListThreadsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListThreadsInput) => {
      try {
        const gmail = getGmailClient();

        // Build params object, only including defined values
        const listParams: {
          userId: string;
          maxResults: number;
          q?: string;
          labelIds?: string[];
          pageToken?: string;
        } = {
          userId: "me",
          maxResults: params.max_results
        };

        if (params.query) {
          listParams.q = params.query;
        }
        if (params.label_ids && params.label_ids.length > 0) {
          listParams.labelIds = params.label_ids;
        }
        if (params.page_token) {
          listParams.pageToken = params.page_token;
        }

        const response = await gmail.users.threads.list(listParams);

        const threadIds = response.data.threads || [];

        // Fetch details for each thread
        const threads: ThreadData[] = await Promise.all(
          threadIds.map(async (thread) => {
            const detail = await gmail.users.threads.get({
              userId: "me",
              id: thread.id!,
              format: "metadata",
              metadataHeaders: ["From", "Subject", "Date"]
            });

            const firstMessage = detail.data.messages?.[0];
            const lastMessage = detail.data.messages?.[detail.data.messages.length - 1];
            const headers = firstMessage?.payload?.headers;

            return {
              id: thread.id || "",
              subject: getHeader(headers, "Subject") || "(no subject)",
              from: getHeader(headers, "From") || "Unknown",
              date: getHeader(lastMessage?.payload?.headers, "Date") || "",
              snippet: thread.snippet || "",
              messageCount: detail.data.messages?.length || 0
            };
          })
        );

        const output = {
          threads,
          result_count: threads.length,
          next_page_token: response.data.nextPageToken || null
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          if (threads.length === 0) {
            textOutput = "No threads found.";
          } else {
            const lines = [
              "# Gmail Threads",
              "",
              `Found ${threads.length} thread(s)${output.next_page_token ? " (more available)" : ""}.`,
              ""
            ];
            for (const thread of threads) {
              lines.push(
                `### ${thread.subject}`,
                `- **From**: ${thread.from}`,
                `- **Messages**: ${thread.messageCount}`,
                `- **Last activity**: ${thread.date}`,
                `- **ID**: \`${thread.id}\``,
                `- **Preview**: ${thread.snippet}`,
                ""
              );
            }
            if (output.next_page_token) {
              lines.push(`*Use page_token="${output.next_page_token}" to load more threads.*`);
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
    "gmail_get_thread",
    {
      title: "Get Gmail Thread",
      description: `Get all messages in a conversation thread.

Args:
  - thread_id (string): The thread ID to retrieve
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  All messages in the thread with full content.`,
      inputSchema: GetThreadSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetThreadInput) => {
      try {
        const gmail = getGmailClient();

        const response = await gmail.users.threads.get({
          userId: "me",
          id: params.thread_id,
          format: "full"
        });

        const messages = (response.data.messages || []).map(msg => {
          const headers = msg.payload?.headers;
          return {
            id: msg.id || "",
            from: getHeader(headers, "From"),
            to: getHeader(headers, "To"),
            subject: getHeader(headers, "Subject"),
            date: getHeader(headers, "Date"),
            body: extractBody(msg.payload)
          };
        });

        const output = {
          id: response.data.id || "",
          messageCount: messages.length,
          messages
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const firstSubject = messages[0]?.subject || "(no subject)";
          const lines = [
            `# Thread: ${firstSubject}`,
            "",
            `${messages.length} message(s) in this thread.`,
            ""
          ];

          for (let i = 0; i < messages.length; i++) {
            const msg = messages[i];
            lines.push(
              `## Message ${i + 1}`,
              "",
              `**From**: ${msg.from || "Unknown"}`,
              `**To**: ${msg.to || "Unknown"}`,
              `**Date**: ${msg.date || "Unknown"}`,
              "",
              msg.body || "(no body content)",
              "",
              "---",
              ""
            );
          }

          textOutput = lines.join("\n");
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
    "gmail_list_labels",
    {
      title: "List Gmail Labels",
      description: `List all labels (folders) in Gmail.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of all labels with their IDs and types.`,
      inputSchema: ListLabelsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListLabelsInput) => {
      try {
        const gmail = getGmailClient();

        const response = await gmail.users.labels.list({
          userId: "me"
        });

        const labels: LabelData[] = (response.data.labels || []).map(label => ({
          id: label.id || "",
          name: label.name || "",
          type: label.type || "user"
        }));

        // Sort: system labels first, then user labels alphabetically
        labels.sort((a, b) => {
          if (a.type === "system" && b.type !== "system") return -1;
          if (a.type !== "system" && b.type === "system") return 1;
          return a.name.localeCompare(b.name);
        });

        const output = { labels };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const systemLabels = labels.filter(l => l.type === "system");
          const userLabels = labels.filter(l => l.type !== "system");

          const lines = [
            "# Gmail Labels",
            "",
            "## System Labels",
            ""
          ];

          for (const label of systemLabels) {
            lines.push(`- **${label.name}** (\`${label.id}\`)`);
          }

          if (userLabels.length > 0) {
            lines.push("", "## User Labels", "");
            for (const label of userLabels) {
              lines.push(`- **${label.name}** (\`${label.id}\`)`);
            }
          }

          textOutput = lines.join("\n");
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
    "gmail_create_draft",
    {
      title: "Create Gmail Draft",
      description: `Create a new email draft in Gmail. The draft is saved but NOT sent automatically.

Args:
  - to (string[]): Array of recipient email addresses (required)
  - subject (string): Email subject line
  - body (string): Email body content (plain text)
  - cc (string[], optional): Array of CC recipient email addresses
  - bcc (string[], optional): Array of BCC recipient email addresses
  - reply_to_message_id (string, optional): Message ID to reply to (for creating reply drafts)

Returns:
  {
    "draftId": string,
    "messageId": string,
    "threadId": string
  }

Examples:
  - Simple draft: to=["bob@example.com"], subject="Hello", body="Hi Bob!"
  - Reply draft: to=["bob@example.com"], subject="Re: Meeting", body="Sounds good!", reply_to_message_id="abc123"`,
      inputSchema: CreateDraftSchema,
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true
      }
    },
    async (params: CreateDraftInput) => {
      try {
        const gmail = getGmailClient();

        // Build email headers
        const headers = [
          `To: ${params.to.join(", ")}`,
          `Subject: ${params.subject}`
        ];

        if (params.cc && params.cc.length > 0) {
          headers.push(`Cc: ${params.cc.join(", ")}`);
        }
        if (params.bcc && params.bcc.length > 0) {
          headers.push(`Bcc: ${params.bcc.join(", ")}`);
        }

        // Build raw email message
        const emailLines = [
          ...headers,
          "Content-Type: text/plain; charset=utf-8",
          "",
          params.body
        ];

        const rawMessage = Buffer.from(emailLines.join("\r\n"))
          .toString("base64")
          .replace(/\+/g, "-")
          .replace(/\//g, "_")
          .replace(/=+$/, "");

        const requestBody: { message: { raw: string; threadId?: string } } = {
          message: { raw: rawMessage }
        };

        // If replying to a message, include the thread ID
        if (params.reply_to_message_id) {
          const originalMsg = await gmail.users.messages.get({
            userId: "me",
            id: params.reply_to_message_id,
            format: "minimal"
          });
          if (originalMsg.data.threadId) {
            requestBody.message.threadId = originalMsg.data.threadId;
          }
        }

        const response = await gmail.users.drafts.create({
          userId: "me",
          requestBody
        });

        const output = {
          draftId: response.data.id || "",
          messageId: response.data.message?.id || "",
          threadId: response.data.message?.threadId || ""
        };

        return {
          content: [{
            type: "text",
            text: `Draft created successfully.\n\n**Draft ID**: ${output.draftId}\n**To**: ${params.to.join(", ")}\n**Subject**: ${params.subject}\n\nThe draft is saved in your Gmail Drafts folder. It will NOT be sent automatically.`
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
    "gmail_list_attachments",
    {
      title: "List Gmail Attachments",
      description: `List all attachments in a specific Gmail message.

Args:
  - message_id (string): The ID of the message to list attachments from
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  {
    "attachments": [
      {
        "attachmentId": string,
        "filename": string,
        "mimeType": string,
        "size": number
      }
    ]
  }`,
      inputSchema: ListAttachmentsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListAttachmentsInput) => {
      try {
        const gmail = getGmailClient();

        const response = await gmail.users.messages.get({
          userId: "me",
          id: params.message_id,
          format: "full"
        });

        const attachments: { attachmentId: string; filename: string; mimeType: string; size: number }[] = [];

        function extractAttachments(parts: gmail_v1.Schema$MessagePart[] | undefined) {
          if (!parts) return;
          for (const part of parts) {
            if (part.filename && part.body?.attachmentId) {
              attachments.push({
                attachmentId: part.body.attachmentId,
                filename: part.filename,
                mimeType: part.mimeType || "application/octet-stream",
                size: part.body.size || 0
              });
            }
            if (part.parts) {
              extractAttachments(part.parts);
            }
          }
        }

        extractAttachments(response.data.payload?.parts);

        const output = { attachments };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          if (attachments.length === 0) {
            textOutput = "No attachments found in this message.";
          } else {
            const lines = [
              "# Message Attachments",
              "",
              `Found ${attachments.length} attachment(s).`,
              ""
            ];
            for (const att of attachments) {
              const sizeKb = (att.size / 1024).toFixed(1);
              lines.push(
                `### ${att.filename}`,
                `- **Type**: ${att.mimeType}`,
                `- **Size**: ${sizeKb} KB`,
                `- **Attachment ID**: \`${att.attachmentId}\``,
                ""
              );
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
    "gmail_get_attachment",
    {
      title: "Get Gmail Attachment",
      description: `Download an attachment from a Gmail message.

Args:
  - message_id (string): The ID of the message containing the attachment
  - attachment_id (string): The ID of the attachment to download (from gmail_list_attachments)
  - filename (string, optional): Filename for the attachment (for display purposes)

Returns:
  The attachment content. For images, returns the image directly. For other files, provides download info.

Examples:
  - Download attachment: message_id="abc123", attachment_id="xyz789"`,
      inputSchema: GetAttachmentSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetAttachmentInput) => {
      try {
        const gmail = getGmailClient();

        const response = await gmail.users.messages.attachments.get({
          userId: "me",
          messageId: params.message_id,
          id: params.attachment_id
        });

        const data = response.data.data;
        if (!data) {
          return {
            content: [{ type: "text", text: "Error: Attachment data is empty." }]
          };
        }

        // Decode base64url to regular base64
        const base64Data = data.replace(/-/g, "+").replace(/_/g, "/");
        const buffer = Buffer.from(base64Data, "base64");

        const filename = params.filename || "attachment";
        const size = response.data.size || buffer.length;

        // Determine mime type from filename
        const ext = filename.toLowerCase().split(".").pop() || "";
        const mimeTypes: Record<string, string> = {
          pdf: "application/pdf",
          png: "image/png",
          jpg: "image/jpeg",
          jpeg: "image/jpeg",
          gif: "image/gif",
          txt: "text/plain",
          csv: "text/csv",
          json: "application/json",
          doc: "application/msword",
          docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
          xls: "application/vnd.ms-excel",
          xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        };
        const mimeType = mimeTypes[ext] || "application/octet-stream";

        // Return appropriate content based on type
        if (mimeType.startsWith("image/")) {
          return {
            content: [
              {
                type: "text",
                text: `**Attachment**: ${filename}\n**Size**: ${(size / 1024).toFixed(1)} KB\n**Type**: ${mimeType}`
              },
              {
                type: "image",
                data: base64Data,
                mimeType: mimeType
              }
            ]
          };
        } else if (mimeType === "text/plain" || mimeType === "text/csv" || mimeType === "application/json") {
          // Return text content
          const textContent = buffer.toString("utf-8");
          return {
            content: [{
              type: "text",
              text: `**Attachment**: ${filename}\n**Size**: ${(size / 1024).toFixed(1)} KB\n**Type**: ${mimeType}\n\n---\n\n${textContent}`
            }]
          };
        } else {
          // For binary files, save to temp and return path
          const os = await import("os");
          const path = await import("path");
          const fs = await import("fs");

          const tempDir = os.tmpdir();
          const safeName = filename.replace(/[^a-zA-Z0-9.-]/g, "_");
          const tempPath = path.join(tempDir, `gmail_${Date.now()}_${safeName}`);
          fs.writeFileSync(tempPath, buffer);

          return {
            content: [{
              type: "text",
              text: `**Attachment**: ${filename}\n**Size**: ${(size / 1024).toFixed(1)} KB\n**Type**: ${mimeType}\n\nFile saved to: ${tempPath}\n\nUse the Read tool to access this file.`
            }]
          };
        }
      } catch (error) {
        return {
          content: [{ type: "text", text: handleGoogleError(error) }]
        };
      }
    }
  );
}
