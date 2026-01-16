import type { docs_v1, drive_v3 } from "googleapis";

export interface DocumentContent {
  documentId: string;
  title: string;
  body: docs_v1.Schema$Body | null;
  revisionId?: string;
}

export interface CommentData {
  id: string;
  content: string;
  author: string;
  createdTime: string;
  modifiedTime?: string | null;
  resolved: boolean;
  quotedFileContent?: string;
  replies: ReplyData[];
}

export interface ReplyData {
  id: string;
  content: string;
  author: string;
  createdTime: string;
}

export interface PaginatedResponse<T> {
  total: number;
  count: number;
  items: T[];
  has_more: boolean;
  next_page_token?: string;
}

export interface FileData {
  id: string;
  name: string;
  mimeType: string;
  createdTime?: string;
  modifiedTime?: string;
  size?: string;
  webViewLink?: string;
  owners?: string[];
}

// Gmail types
export interface MessageData {
  id: string;
  threadId: string;
  from?: string;
  to?: string;
  subject?: string;
  date?: string;
  snippet?: string;
  labels?: string[];
  body?: string;
}

export interface ThreadData {
  id: string;
  subject: string;
  from: string;
  date: string;
  snippet: string;
  messageCount: number;
}

export interface LabelData {
  id: string;
  name: string;
  type: string;
}

// Calendar types
export interface CalendarData {
  id: string;
  summary: string;
  description?: string;
  primary: boolean;
  accessRole: string;
  backgroundColor?: string;
}

export interface EventData {
  id: string;
  summary: string;
  description?: string;
  location?: string;
  start: string;
  end: string;
  startFormatted: string;
  endFormatted: string;
  status: string;
  htmlLink?: string;
  attendees?: string[];
  organizer?: string;
  isAllDay?: boolean;
}
