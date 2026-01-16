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
