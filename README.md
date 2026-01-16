# Google Workspace MCP Server

MCP server for Google Workspace APIs - Docs, Sheets, and Drive Comments.

## Installation

```bash
npx google-workspace-mcp-server
```

Or install globally:

```bash
npm install -g google-workspace-mcp-server
google-workspace-mcp-server
```

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

### Google Drive API (Comments)

| Tool | Description |
|------|-------------|
| `drive_list_comments` | List comments on a document |
| `drive_create_comment` | Add a comment (anchored or unanchored) |
| `drive_reply_to_comment` | Reply to an existing comment |
| `drive_resolve_comment` | Mark comment as resolved |
| `drive_delete_comment` | Delete a comment |

## Setup

### 1. Create OAuth Credentials

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a project (or select existing)
3. Enable **Google Docs API**, **Google Sheets API**, and **Google Drive API**
4. Go to **APIs & Services > Credentials**
5. Click **Create Credentials > OAuth client ID**
6. Choose **Web application**
7. Add `https://developers.google.com/oauthplayground` as an **Authorized redirect URI**
8. Save your **Client ID** and **Client Secret**

### 2. Get Refresh Token

1. Go to [OAuth 2.0 Playground](https://developers.google.com/oauthplayground/)
2. Click the **gear icon** (top right) > check **"Use your own OAuth credentials"**
3. Enter your **Client ID** and **Client Secret**
4. In the left panel, select scopes:
   - `Google Docs API v1` > `https://www.googleapis.com/auth/documents`
   - `Google Sheets API v4` > `https://www.googleapis.com/auth/spreadsheets`
   - `Google Drive API v3` > `https://www.googleapis.com/auth/drive`
5. Click **Authorize APIs** > sign in with your Google account
6. Click **Exchange authorization code for tokens**
7. Copy the **Refresh Token**

### 3. Claude Code Configuration

Add to your Claude Code settings (`~/.claude.json` or project settings):

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
