import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { getCalendarClient, handleGoogleError } from "../services/google-auth.js";
import {
  ListCalendarsSchema,
  ListEventsSchema,
  GetEventSchema,
  type ListCalendarsInput,
  type ListEventsInput,
  type GetEventInput
} from "../schemas/calendar.js";
import { ResponseFormat } from "../constants.js";
import type { CalendarData, EventData } from "../types.js";

function formatDateTime(dateTime: string | undefined | null, date: string | undefined | null): string {
  if (dateTime) {
    const d = new Date(dateTime);
    return d.toLocaleString();
  }
  if (date) {
    return `${date} (all day)`;
  }
  return "Unknown";
}

function formatEventForMarkdown(event: EventData): string {
  const lines = [
    `### ${event.summary || "(no title)"}`,
    `- **When**: ${event.startFormatted} → ${event.endFormatted}`,
    `- **ID**: \`${event.id}\``
  ];

  if (event.location) {
    lines.push(`- **Location**: ${event.location}`);
  }

  if (event.status && event.status !== "confirmed") {
    lines.push(`- **Status**: ${event.status}`);
  }

  if (event.attendees && event.attendees.length > 0) {
    lines.push(`- **Attendees**: ${event.attendees.join(", ")}`);
  }

  if (event.description) {
    const shortDesc = event.description.length > 200
      ? event.description.substring(0, 200) + "..."
      : event.description;
    lines.push(`- **Description**: ${shortDesc}`);
  }

  return lines.join("\n");
}

export function registerCalendarTools(server: McpServer): void {
  server.registerTool(
    "calendar_list_calendars",
    {
      title: "List Calendars",
      description: `List all calendars accessible to the user.

Args:
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of calendars with their IDs, names, and access roles.`,
      inputSchema: ListCalendarsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListCalendarsInput) => {
      try {
        const calendar = getCalendarClient();

        const response = await calendar.calendarList.list();

        const calendars: CalendarData[] = (response.data.items || []).map(cal => ({
          id: cal.id || "",
          summary: cal.summary || "",
          description: cal.description || undefined,
          primary: cal.primary || false,
          accessRole: cal.accessRole || "reader",
          backgroundColor: cal.backgroundColor || undefined
        }));

        // Sort: primary first, then alphabetically
        calendars.sort((a, b) => {
          if (a.primary && !b.primary) return -1;
          if (!a.primary && b.primary) return 1;
          return a.summary.localeCompare(b.summary);
        });

        const output = { calendars };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            "# Your Calendars",
            "",
            `Found ${calendars.length} calendar(s).`,
            ""
          ];

          for (const cal of calendars) {
            lines.push(
              `### ${cal.summary}${cal.primary ? " ⭐ (Primary)" : ""}`,
              `- **ID**: \`${cal.id}\``,
              `- **Access**: ${cal.accessRole}`
            );
            if (cal.description) {
              lines.push(`- **Description**: ${cal.description}`);
            }
            lines.push("");
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
    "calendar_list_events",
    {
      title: "List Calendar Events",
      description: `List events from a calendar within an optional time range.

Args:
  - calendar_id (string): Calendar ID (default: 'primary' for main calendar)
  - time_min (string, optional): Start of time range in ISO 8601 format (e.g., '2024-01-01T00:00:00Z')
  - time_max (string, optional): End of time range in ISO 8601 format
  - max_results (number): Maximum events to return, 1-250 (default: 10)
  - query (string, optional): Free text search to filter events
  - single_events (boolean): Expand recurring events into instances (default: true)
  - order_by ('startTime' | 'updated'): Sort order (default: 'startTime')
  - page_token (string, optional): Token for pagination
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  List of events with title, time, location, and attendees.

Examples:
  - Today's events: time_min="2024-01-15T00:00:00Z", time_max="2024-01-16T00:00:00Z"
  - Search meetings: query="standup"
  - Next 7 days: time_min=(now), time_max=(now + 7 days)`,
      inputSchema: ListEventsSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: ListEventsInput) => {
      try {
        const calendar = getCalendarClient();

        // Default to showing future events if no time range specified
        const timeMin = params.time_min || new Date().toISOString();

        const response = await calendar.events.list({
          calendarId: params.calendar_id,
          timeMin,
          timeMax: params.time_max,
          maxResults: params.max_results,
          q: params.query,
          singleEvents: params.single_events,
          orderBy: params.order_by,
          pageToken: params.page_token
        });

        const events: EventData[] = (response.data.items || []).map(event => ({
          id: event.id || "",
          summary: event.summary || "(no title)",
          description: event.description || undefined,
          location: event.location || undefined,
          start: event.start?.dateTime || event.start?.date || "",
          end: event.end?.dateTime || event.end?.date || "",
          startFormatted: formatDateTime(event.start?.dateTime, event.start?.date),
          endFormatted: formatDateTime(event.end?.dateTime, event.end?.date),
          status: event.status || "confirmed",
          htmlLink: event.htmlLink || undefined,
          attendees: event.attendees?.map(a => a.email || a.displayName || "Unknown") || [],
          organizer: event.organizer?.email || event.organizer?.displayName || undefined,
          isAllDay: !event.start?.dateTime
        }));

        const output = {
          events,
          result_count: events.length,
          next_page_token: response.data.nextPageToken || null
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          if (events.length === 0) {
            textOutput = params.query
              ? `No events found matching "${params.query}".`
              : "No events found in the specified time range.";
          } else {
            const lines = [
              "# Calendar Events",
              "",
              `Found ${events.length} event(s)${output.next_page_token ? " (more available)" : ""}.`,
              ""
            ];

            for (const event of events) {
              lines.push(formatEventForMarkdown(event), "");
            }

            if (output.next_page_token) {
              lines.push(`*Use page_token="${output.next_page_token}" to load more events.*`);
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
    "calendar_get_event",
    {
      title: "Get Calendar Event",
      description: `Get detailed information about a specific calendar event.

Args:
  - calendar_id (string): Calendar ID (default: 'primary')
  - event_id (string): The event ID to retrieve
  - response_format ('markdown' | 'json'): Output format (default: 'markdown')

Returns:
  Full event details including description, attendees, and conference info.`,
      inputSchema: GetEventSchema,
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      }
    },
    async (params: GetEventInput) => {
      try {
        const calendar = getCalendarClient();

        const response = await calendar.events.get({
          calendarId: params.calendar_id,
          eventId: params.event_id
        });

        const event = response.data;

        const output = {
          id: event.id || "",
          summary: event.summary || "(no title)",
          description: event.description || undefined,
          location: event.location || undefined,
          start: event.start?.dateTime || event.start?.date || "",
          end: event.end?.dateTime || event.end?.date || "",
          startFormatted: formatDateTime(event.start?.dateTime, event.start?.date),
          endFormatted: formatDateTime(event.end?.dateTime, event.end?.date),
          status: event.status || "confirmed",
          htmlLink: event.htmlLink || undefined,
          attendees: event.attendees?.map(a => ({
            email: a.email || "",
            displayName: a.displayName || undefined,
            responseStatus: a.responseStatus || "needsAction",
            organizer: a.organizer || false
          })) || [],
          organizer: {
            email: event.organizer?.email || "",
            displayName: event.organizer?.displayName || undefined
          },
          created: event.created || undefined,
          updated: event.updated || undefined,
          recurrence: event.recurrence || undefined,
          conferenceData: event.conferenceData ? {
            type: event.conferenceData.conferenceSolution?.name || "Unknown",
            entryPoints: event.conferenceData.entryPoints?.map(ep => ({
              type: ep.entryPointType || "",
              uri: ep.uri || ""
            })) || []
          } : undefined
        };

        let textOutput: string;
        if (params.response_format === ResponseFormat.MARKDOWN) {
          const lines = [
            `# ${output.summary}`,
            "",
            `**When**: ${output.startFormatted} → ${output.endFormatted}`,
            `**Status**: ${output.status}`
          ];

          if (output.location) {
            lines.push(`**Location**: ${output.location}`);
          }

          if (output.organizer.email) {
            lines.push(`**Organizer**: ${output.organizer.displayName || output.organizer.email}`);
          }

          if (output.htmlLink) {
            lines.push(`**Link**: ${output.htmlLink}`);
          }

          if (output.conferenceData) {
            lines.push("", "## Conference Info", "");
            lines.push(`**Type**: ${output.conferenceData.type}`);
            for (const ep of output.conferenceData.entryPoints) {
              lines.push(`- ${ep.type}: ${ep.uri}`);
            }
          }

          if (output.attendees.length > 0) {
            lines.push("", "## Attendees", "");
            for (const attendee of output.attendees) {
              const status = attendee.responseStatus === "accepted" ? "✓" :
                            attendee.responseStatus === "declined" ? "✗" :
                            attendee.responseStatus === "tentative" ? "?" : "•";
              const name = attendee.displayName || attendee.email;
              const role = attendee.organizer ? " (organizer)" : "";
              lines.push(`- ${status} ${name}${role}`);
            }
          }

          if (output.description) {
            lines.push("", "## Description", "", output.description);
          }

          if (output.recurrence) {
            lines.push("", "## Recurrence", "", output.recurrence.join("\n"));
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
}
