import { z } from "zod";
import { ResponseFormat } from "../constants.js";

export const ListMessagesSchema = z.object({
  query: z.string()
    .optional()
    .describe("Gmail search query (e.g., 'from:someone@example.com is:unread', 'subject:invoice')"),
  max_results: z.number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe("Maximum messages to return (1-100)"),
  label_ids: z.array(z.string())
    .optional()
    .describe("Filter by label IDs (e.g., ['INBOX', 'UNREAD', 'STARRED'])"),
  page_token: z.string()
    .optional()
    .describe("Token for pagination to retrieve the next page of results"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

export type ListMessagesInput = z.infer<typeof ListMessagesSchema>;

export const GetMessageSchema = z.object({
  message_id: z.string()
    .min(1, "Message ID is required")
    .describe("The ID of the message to retrieve"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

export type GetMessageInput = z.infer<typeof GetMessageSchema>;

export const ListThreadsSchema = z.object({
  query: z.string()
    .optional()
    .describe("Gmail search query to filter threads"),
  max_results: z.number()
    .int()
    .min(1)
    .max(100)
    .default(10)
    .describe("Maximum threads to return (1-100)"),
  label_ids: z.array(z.string())
    .optional()
    .describe("Filter by label IDs"),
  page_token: z.string()
    .optional()
    .describe("Token for pagination"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListThreadsInput = z.infer<typeof ListThreadsSchema>;

export const GetThreadSchema = z.object({
  thread_id: z.string()
    .min(1, "Thread ID is required")
    .describe("The ID of the thread to retrieve"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type GetThreadInput = z.infer<typeof GetThreadSchema>;

export const ListLabelsSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListLabelsInput = z.infer<typeof ListLabelsSchema>;

export const CreateDraftSchema = z.object({
  to: z.array(z.string())
    .min(1, "At least one recipient is required")
    .describe("Array of recipient email addresses"),
  subject: z.string()
    .describe("Email subject line"),
  body: z.string()
    .describe("Email body content (plain text)"),
  cc: z.array(z.string())
    .optional()
    .describe("Array of CC recipient email addresses"),
  bcc: z.array(z.string())
    .optional()
    .describe("Array of BCC recipient email addresses"),
  reply_to_message_id: z.string()
    .optional()
    .describe("Message ID to reply to (for creating reply drafts)")
}).strict();

export type CreateDraftInput = z.infer<typeof CreateDraftSchema>;

export const GetAttachmentSchema = z.object({
  message_id: z.string()
    .min(1, "Message ID is required")
    .describe("The ID of the message containing the attachment"),
  attachment_id: z.string()
    .min(1, "Attachment ID is required")
    .describe("The ID of the attachment to download"),
  filename: z.string()
    .optional()
    .describe("Optional filename for the attachment (used for saving)")
}).strict();

export type GetAttachmentInput = z.infer<typeof GetAttachmentSchema>;

export const ListAttachmentsSchema = z.object({
  message_id: z.string()
    .min(1, "Message ID is required")
    .describe("The ID of the message to list attachments from"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListAttachmentsInput = z.infer<typeof ListAttachmentsSchema>;
