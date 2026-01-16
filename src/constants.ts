export const CHARACTER_LIMIT = 25000;

export enum ResponseFormat {
  MARKDOWN = "markdown",
  JSON = "json"
}

export const SCOPES = [
  "https://www.googleapis.com/auth/documents",
  "https://www.googleapis.com/auth/drive",
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly"
];
