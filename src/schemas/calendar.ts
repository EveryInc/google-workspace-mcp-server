import { z } from "zod";
import { ResponseFormat } from "../constants.js";

export const ListCalendarsSchema = z.object({
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' for human-readable or 'json' for structured data")
}).strict();

export type ListCalendarsInput = z.infer<typeof ListCalendarsSchema>;

export const ListEventsSchema = z.object({
  calendar_id: z.string()
    .default("primary")
    .describe("Calendar ID (default: 'primary' for user's main calendar)"),
  time_min: z.string()
    .optional()
    .describe("Start of time range (ISO 8601 format, e.g., '2024-01-01T00:00:00Z')"),
  time_max: z.string()
    .optional()
    .describe("End of time range (ISO 8601 format)"),
  max_results: z.number()
    .int()
    .min(1)
    .max(250)
    .default(10)
    .describe("Maximum events to return (1-250)"),
  query: z.string()
    .optional()
    .describe("Free text search terms to find events"),
  single_events: z.boolean()
    .default(true)
    .describe("Whether to expand recurring events into instances"),
  order_by: z.enum(["startTime", "updated"])
    .default("startTime")
    .describe("Sort order (requires single_events=true for 'startTime')"),
  page_token: z.string()
    .optional()
    .describe("Token for pagination"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type ListEventsInput = z.infer<typeof ListEventsSchema>;

export const GetEventSchema = z.object({
  calendar_id: z.string()
    .default("primary")
    .describe("Calendar ID (default: 'primary')"),
  event_id: z.string()
    .min(1, "Event ID is required")
    .describe("The ID of the event to retrieve"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type GetEventInput = z.infer<typeof GetEventSchema>;

export const FreeBusyQuerySchema = z.object({
  time_min: z.string()
    .describe("Start of the time range (ISO 8601 format, e.g., '2024-01-15T00:00:00Z')"),
  time_max: z.string()
    .describe("End of the time range (ISO 8601 format, e.g., '2024-01-22T00:00:00Z')"),
  calendar_ids: z.array(z.string())
    .min(1, "At least one calendar ID or email is required")
    .describe("Array of calendar IDs or email addresses to check (e.g., ['primary', 'colleague@company.com'])"),
  response_format: z.nativeEnum(ResponseFormat)
    .default(ResponseFormat.MARKDOWN)
    .describe("Output format: 'markdown' or 'json'")
}).strict();

export type FreeBusyQueryInput = z.infer<typeof FreeBusyQuerySchema>;
