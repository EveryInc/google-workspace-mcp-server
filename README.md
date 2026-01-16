# Google Workspace MCP Server

MCP server for Google Workspace APIs - Docs, Sheets, Drive, Gmail, and Calendar. Use it with Claude Code to read, create, and edit Google Docs and Sheets, manage comments, read emails, and view calendar events.

## Quick Start

1. Get your Google credentials (see [Setup](#setup) below)
2. Add to your Claude Code config (`~/.claude.json`):

```json
{
  "mcpServers": {
    "google-workspace": {
      "type": "stdio",
      "command": "npx",
      "args": ["google-workspace-mcp-server"],
      "env": {
        "GOOGLE_CLIENT_ID": "your-client-id",
        "GOOGLE_CLIENT_SECRET": "your-client-secret",
        "GOOGLE_REFRESH_TOKEN": "your-refresh-token"
      }
    }
  }
}
```

3. Restart Claude Code

## Setup

### Step 1: Create a Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Click the project dropdown (top left) → **New Project**
3. Name it something like "MCP Server" → **Create**
4. Wait for the project to be created, then select it

### Step 2: Enable the APIs

1. Go to **APIs & Services** → **Library** (or [click here](https://console.cloud.google.com/apis/library))
2. Search for and enable each of these APIs:
   - **Google Docs API** → Click → **Enable**
   - **Google Sheets API** → Click → **Enable**
   - **Google Drive API** → Click → **Enable**
   - **Gmail API** → Click → **Enable**
   - **Google Calendar API** → Click → **Enable**

### Step 3: Configure OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select user type:
   - **Internal** (only if you have Google Workspace) - simpler, no test user setup needed
   - **External** (for personal Gmail accounts) - requires adding yourself as a test user
3. Click **Create**
4. Fill in the required fields:
   - **App name**: "MCP Server" (or anything)
   - **User support email**: your email
   - **Developer contact email**: your email
5. Click **Save and Continue**
6. On **Scopes** page, click **Save and Continue** (no changes needed)
7. On **Test users** page (External only): click **Add Users** → add your Google email → **Save and Continue**
8. Click **Back to Dashboard**

### Step 4: Create OAuth Credentials

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Application type: **Web application**
4. Name: "MCP Server" (or anything)
5. Under **Authorized redirect URIs**, click **Add URI** and enter:
   ```
   https://developers.google.com/oauthplayground
   ```
6. Click **Create**
7. **Copy and save your Client ID and Client Secret** - you'll need these!

### Step 5: Get Your Refresh Token

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)

2. Click the **gear icon** (⚙️) in the top right corner

3. Check **"Use your own OAuth credentials"**

4. Enter your **Client ID** and **Client Secret** from Step 4

5. Close the settings

6. In the left panel, find and select these scopes:
   - **Google Docs API v1** → `https://www.googleapis.com/auth/documents`
   - **Google Sheets API v4** → `https://www.googleapis.com/auth/spreadsheets`
   - **Google Drive API v3** → `https://www.googleapis.com/auth/drive`
   - **Gmail API v1** → `https://www.googleapis.com/auth/gmail.readonly`
   - **Google Calendar API v3** → `https://www.googleapis.com/auth/calendar.readonly`

7. Click **Authorize APIs**

8. Sign in with your Google account and grant permissions
   - If you see "Google hasn't verified this app", click **Advanced** → **Go to MCP Server (unsafe)**
   - Click **Continue** to grant permissions

9. Click **Exchange authorization code for tokens**

10. **Copy the Refresh Token** (not the Access Token!) - this is what you need!

### Step 6: Configure Claude Code

Add the MCP server to your Claude Code settings. Edit `~/.claude.json`:

```json
{
  "mcpServers": {
    "google-workspace": {
      "type": "stdio",
      "command": "npx",
      "args": ["google-workspace-mcp-server"],
      "env": {
        "GOOGLE_CLIENT_ID": "123456789-abcdefg.apps.googleusercontent.com",
        "GOOGLE_CLIENT_SECRET": "GOCSPX-xxxxxxxxxxxxx",
        "GOOGLE_REFRESH_TOKEN": "1//04xxxxxxxxxxxxx"
      }
    }
  }
}
```

Replace the values with your actual credentials from Steps 4 and 5.

### Step 7: Restart Claude Code

Restart Claude Code to load the new MCP server. You should now be able to use Google Workspace tools!

## Tools

### Google Docs API

| Tool | Description |
|------|-------------|
| `docs_get_document` | Get document content by ID |
| `docs_create_document` | Create a new document |
| `docs_batch_update` | Insert/update/delete text, formatting, images, tables |

### Google Sheets API

| Tool | Description |
|------|-------------|
| `sheets_get_spreadsheet` | Get spreadsheet metadata |
| `sheets_get_values` | Read cell values from a range |
| `sheets_batch_get_values` | Read from multiple ranges |
| `sheets_update_values` | Write values to a range |
| `sheets_append_values` | Append rows to a table |
| `sheets_create_spreadsheet` | Create a new spreadsheet |
| `sheets_batch_update` | Apply formatting, charts, filters |
| `sheets_clear_values` | Clear cell values from a range |

### Google Drive API

| Tool | Description |
|------|-------------|
| `drive_get_file` | Download file content (PDFs, images, etc.) |
| `drive_list_files` | List files in your Drive |
| `drive_search_files` | Search for files by name or content |
| `drive_list_comments` | List comments on a document |
| `drive_create_comment` | Add a comment (anchored or unanchored) |
| `drive_reply_to_comment` | Reply to an existing comment |
| `drive_resolve_comment` | Mark comment as resolved |
| `drive_delete_comment` | Delete a comment |

### Gmail API (Read-Only)

| Tool | Description |
|------|-------------|
| `gmail_list_messages` | List messages with optional search filters |
| `gmail_get_message` | Get full content of a specific message |
| `gmail_list_threads` | List conversation threads |
| `gmail_get_thread` | Get all messages in a thread |
| `gmail_list_labels` | List all Gmail labels (folders) |

### Google Calendar API (Read-Only)

| Tool | Description |
|------|-------------|
| `calendar_list_calendars` | List all accessible calendars |
| `calendar_list_events` | List events with time range and search filters |
| `calendar_get_event` | Get detailed event information |

## Usage Examples

Once configured, you can ask Claude Code things like:

- "Read my Google Doc at https://docs.google.com/document/d/abc123/edit"
- "Read this PDF from my Drive: https://drive.google.com/file/d/xyz789/view"
- "Create a new Google Doc with meeting notes from today"
- "Add a row to my spreadsheet with today's data"
- "Search my Drive for files about project planning"
- "Show me the comments on this document"
- "Reply to John's comment saying I'll fix it tomorrow"
- "Show me my unread emails"
- "Find emails from notifications@github.com"
- "What's on my calendar today?"
- "Show me my meetings for this week"
- "Get the details of that standup meeting"

## Troubleshooting

### "Access token expired" errors
The MCP server automatically refreshes tokens using your refresh token. If you see this error, your refresh token may have been revoked. Go through Step 5 again to get a new one.

### "App not verified" warning
This is normal for personal projects. Click **Advanced** → **Go to [App Name] (unsafe)** to proceed.

### "Insufficient permissions" errors
Make sure you enabled all five APIs (Docs, Sheets, Drive, Gmail, Calendar) in Step 2, and selected all five scopes in Step 5.

## Environment Variables

| Variable | Description |
|----------|-------------|
| `GOOGLE_CLIENT_ID` | OAuth 2.0 Client ID from Google Cloud Console |
| `GOOGLE_CLIENT_SECRET` | OAuth 2.0 Client Secret |
| `GOOGLE_REFRESH_TOKEN` | Refresh token from OAuth Playground |

## Development

```bash
# Clone the repo
git clone https://github.com/nityeshaga/google-workspace-mcp-server.git
cd google-workspace-mcp-server

# Install dependencies
npm install

# Build
npm run build

# Run locally
npm start
```

## License

MIT
