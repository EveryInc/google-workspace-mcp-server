import { z } from "zod";
import { ResponseFormat } from "../constants.js";

export const ListCommentsSchema = z.object({
  file_id: z.string()
    .min(1, "File ID is required")
    .describe("The ID of the Google Doc to list comments from"),
  include_deleted: z.boolean()
    .default(false)
    .describe("Whether to include deleted comments"),
  page_size: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of comments to return (1-100)"),
  page_token: z.string()
    .optional()
    .describe("Token for pagination to retrieve the next page of results"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

export type ListCommentsInput = z.infer<typeof ListCommentsSchema>;

export const CreateCommentSchema = z.object({
  file_id: z.string()
    .min(1, "File ID is required")
    .describe("The ID of the Google Doc to add a comment to"),
  content: z.string()
    .min(1, "Comment content is required")
    .describe("The text content of the comment"),
  quoted_text: z.string()
    .optional()
    .describe("Optional text to anchor the comment to (for anchored comments)")
}).strict();

export type CreateCommentInput = z.infer<typeof CreateCommentSchema>;

export const ReplyToCommentSchema = z.object({
  file_id: z.string()
    .min(1, "File ID is required")
    .describe("The ID of the Google Doc containing the comment"),
  comment_id: z.string()
    .min(1, "Comment ID is required")
    .describe("The ID of the comment to reply to"),
  content: z.string()
    .min(1, "Reply content is required")
    .describe("The text content of the reply")
}).strict();

export type ReplyToCommentInput = z.infer<typeof ReplyToCommentSchema>;

export const ResolveCommentSchema = z.object({
  file_id: z.string()
    .min(1, "File ID is required")
    .describe("The ID of the Google Doc containing the comment"),
  comment_id: z.string()
    .min(1, "Comment ID is required")
    .describe("The ID of the comment to resolve")
}).strict();

export type ResolveCommentInput = z.infer<typeof ResolveCommentSchema>;

export const DeleteCommentSchema = z.object({
  file_id: z.string()
    .min(1, "File ID is required")
    .describe("The ID of the Google Doc containing the comment"),
  comment_id: z.string()
    .min(1, "Comment ID is required")
    .describe("The ID of the comment to delete")
}).strict();

export type DeleteCommentInput = z.infer<typeof DeleteCommentSchema>;

export const ListFilesSchema = z.object({
  page_size: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of files to return (1-100)"),
  page_token: z.string()
    .optional()
    .describe("Token for pagination to retrieve the next page of results"),
  order_by: z.string()
    .default("modifiedTime desc")
    .describe("Sort order (e.g., 'modifiedTime desc', 'name', 'createdTime desc')"),
  mime_type: z.enum(["all", "documents", "spreadsheets", "presentations", "folders"])
    .default("all")
    .describe("Filter by file type"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

export type ListFilesInput = z.infer<typeof ListFilesSchema>;

export const SearchFilesSchema = z.object({
  query: z.string()
    .min(1, "Search query is required")
    .describe("Search query - searches file names and content"),
  page_size: z.number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe("Maximum number of files to return (1-100)"),
  page_token: z.string()
    .optional()
    .describe("Token for pagination to retrieve the next page of results"),
  mime_type: z.enum(["all", "documents", "spreadsheets", "presentations", "folders"])
    .default("all")
    .describe("Filter by file type"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

export type SearchFilesInput = z.infer<typeof SearchFilesSchema>;

export const GetFileSchema = z.object({
  file_id: z.string()
    .min(1, "File ID is required")
    .describe("The ID of the file to download (found in the URL)")
}).strict();

export type GetFileInput = z.infer<typeof GetFileSchema>;

export const CopyFileSchema = z.object({
  file_id: z.string()
    .min(1, "File ID is required")
    .describe("The ID of the file to copy"),
  name: z.string()
    .optional()
    .describe("New name for the copied file (defaults to 'Copy of [original name]')"),
  parent_folder_id: z.string()
    .optional()
    .describe("ID of the folder to copy the file into (defaults to same location as original)")
}).strict();

export type CopyFileInput = z.infer<typeof CopyFileSchema>;
