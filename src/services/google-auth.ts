import { OAuth2Client } from "google-auth-library";
import { google, docs_v1, drive_v3, sheets_v4, gmail_v1, calendar_v3 } from "googleapis";

let oauth2Client: OAuth2Client | null = null;
let docsClient: docs_v1.Docs | null = null;
let driveClient: drive_v3.Drive | null = null;
let sheetsClient: sheets_v4.Sheets | null = null;
let gmailClient: gmail_v1.Gmail | null = null;
let calendarClient: calendar_v3.Calendar | null = null;

export function initializeGoogleAuth(): void {
  const clientId = process.env.GOOGLE_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
  const refreshToken = process.env.GOOGLE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    throw new Error(
      "Missing required environment variables: GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN"
    );
  }

  oauth2Client = new OAuth2Client(clientId, clientSecret);
  oauth2Client.setCredentials({ refresh_token: refreshToken });

  docsClient = google.docs({ version: "v1", auth: oauth2Client });
  driveClient = google.drive({ version: "v3", auth: oauth2Client });
  sheetsClient = google.sheets({ version: "v4", auth: oauth2Client });
  gmailClient = google.gmail({ version: "v1", auth: oauth2Client });
  calendarClient = google.calendar({ version: "v3", auth: oauth2Client });
}

export function getDocsClient(): docs_v1.Docs {
  if (!docsClient) {
    throw new Error("Google auth not initialized. Call initializeGoogleAuth() first.");
  }
  return docsClient;
}

export function getDriveClient(): drive_v3.Drive {
  if (!driveClient) {
    throw new Error("Google auth not initialized. Call initializeGoogleAuth() first.");
  }
  return driveClient;
}

export function getSheetsClient(): sheets_v4.Sheets {
  if (!sheetsClient) {
    throw new Error("Google auth not initialized. Call initializeGoogleAuth() first.");
  }
  return sheetsClient;
}

export function getGmailClient(): gmail_v1.Gmail {
  if (!gmailClient) {
    throw new Error("Google auth not initialized. Call initializeGoogleAuth() first.");
  }
  return gmailClient;
}

export function getCalendarClient(): calendar_v3.Calendar {
  if (!calendarClient) {
    throw new Error("Google auth not initialized. Call initializeGoogleAuth() first.");
  }
  return calendarClient;
}

export function handleGoogleError(error: unknown): string {
  if (error instanceof Error) {
    const message = error.message;

    if (message.includes("401") || message.includes("invalid_grant")) {
      return "Error: Authentication failed. Please check your Google OAuth credentials and refresh token.";
    }
    if (message.includes("403")) {
      return "Error: Permission denied. Ensure the OAuth token has the required scopes (documents, drive).";
    }
    if (message.includes("404")) {
      return "Error: Resource not found. Please check the document or comment ID.";
    }
    if (message.includes("429")) {
      return "Error: Rate limit exceeded. Please wait before making more requests.";
    }
    if (message.includes("400")) {
      return `Error: Invalid request. ${message}`;
    }

    return `Error: ${message}`;
  }

  return `Error: Unexpected error occurred: ${String(error)}`;
}
