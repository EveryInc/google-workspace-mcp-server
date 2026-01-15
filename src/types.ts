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
