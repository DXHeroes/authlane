# Google Drive Integration

OAuth 2.0 integration for Google Drive with comprehensive file management, upload, download, and sharing capabilities.

## Features

- **File Management**: List, get, create, update, and delete files and folders
- **File Operations**: Upload, download, copy, and export files
- **Folder Operations**: Create and manage folder hierarchies
- **Search**: Powerful search using Google Drive query syntax
- **Sharing**: Share files and folders with users, groups, or make them public
- **Permissions**: Manage access permissions for files and folders
- **Export**: Export Google Workspace documents to various formats (PDF, DOCX, XLSX, etc.)
- **Trash Management**: Move files to trash or permanently delete them

## OAuth Configuration

### Using Existing Google Cloud Project (Gmail)

If you already have a Google Cloud Project set up for Gmail integration, you can reuse the same OAuth credentials by adding Google Drive API scopes:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your existing project
3. Navigate to **APIs & Services** → **Library**
4. Search for "Google Drive API" and click **Enable**
5. Go to **OAuth consent screen** and add the required scopes (see below)
6. Use the same Client ID and Client Secret from your Gmail integration

### Creating a New Google Cloud Project

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Navigate to **APIs & Services** → **Credentials**
4. Click **Create Credentials** → **OAuth client ID**
5. If prompted, configure the OAuth consent screen first

### Configuring OAuth Consent Screen

1. Go to **APIs & Services** → **OAuth consent screen**
2. Select **External** (or **Internal** for Google Workspace)
3. Fill in the required fields:
   - App name
   - User support email
   - Developer contact information
4. Add scopes (see below)
5. Add test users (if in testing mode)

### Required OAuth Scopes

**Full access (recommended for comprehensive file management)**:
- `https://www.googleapis.com/auth/drive` - Full access to Google Drive

**Granular access (use only what you need)**:
- `https://www.googleapis.com/auth/drive.file` - View and manage files created by this app
- `https://www.googleapis.com/auth/drive.readonly` - View files and folders (read-only)
- `https://www.googleapis.com/auth/drive.metadata` - View and manage file metadata
- `https://www.googleapis.com/auth/drive.metadata.readonly` - View file metadata (read-only)
- `https://www.googleapis.com/auth/drive.appdata` - View and manage app-specific data

**Default scopes** (configured in config.yaml):
- `https://www.googleapis.com/auth/drive.file` - Manage app-created files
- `https://www.googleapis.com/auth/drive.readonly` - Read access to all files

### Creating OAuth 2.0 Client ID

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Add your redirect URI:
   ```
   http://localhost:3000/api/v1/users/{user_id}/connections/google-drive/callback
   ```
5. Click **Create** and save your Client ID and Client Secret

### Enable Google Drive API

1. Go to **APIs & Services** → **Library**
2. Search for "Google Drive API"
3. Click **Enable**

### Environment Variables

Set the following environment variables (can reuse Gmail credentials if from same Google Cloud Project):

```bash
GOOGLE_DRIVE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret
```

Or if reusing Gmail credentials:
```bash
GOOGLE_CLIENT_ID=your_client_id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your_client_secret
```

## Available Tools

### File Listing and Search Tools

#### `gdrive_list_files`
Lists files and folders in Google Drive with optional filtering and pagination.

```typescript
{
  query: "name contains 'report'",         // Optional: search query
  max_results: 10,                         // Max files to return (default: 10, max: 1000)
  page_token: "...",                       // Pagination token
  order_by: "modifiedTime desc",           // Sort order
  folder_id: "folder_id_123",              // List files in specific folder
  include_trashed: false,                  // Include trashed files
  spaces: "drive",                         // Spaces to query: drive, appDataFolder, photos
  fields: "files(id,name,mimeType,size)",  // Specific fields to return
  supports_all_drives: false               // Include shared drives
}
```

**Common queries**:
- List all files: `{}`
- List files in folder: `{ folder_id: "folder_id_123" }`
- List PDFs: `{ query: "mimeType = 'application/pdf'" }`
- List images: `{ query: "mimeType contains 'image/'" }`
- Recently modified: `{ order_by: "modifiedTime desc", max_results: 20 }`

#### `gdrive_search_files`
Searches for files using Google Drive query syntax.

```typescript
{
  query: "name contains 'report' and mimeType contains 'pdf'", // Required: search query
  max_results: 10,                         // Max results (default: 10, max: 1000)
  order_by: "modifiedTime desc",           // Sort order
  page_token: "...",                       // Pagination token
  supports_all_drives: false               // Include shared drives
}
```

**Search operators**:
- `name contains 'keyword'` - Name contains keyword
- `name = 'exact name'` - Exact name match
- `mimeType = 'application/pdf'` - Specific MIME type
- `mimeType contains 'image/'` - Any image type
- `modifiedTime > '2024-01-01T00:00:00'` - Modified after date
- `'folder_id' in parents` - Files in specific folder
- `trashed = true` - Only trashed files
- `starred = true` - Only starred files
- `'user@example.com' in owners` - Owned by specific user
- `fullText contains 'keyword'` - Full-text search

See [Google Drive Search Query Language](https://developers.google.com/drive/api/guides/search-files) for complete syntax.

#### `gdrive_get_file`
Gets metadata for a specific file or folder by ID.

```typescript
{
  file_id: "file_id_123",                  // Required: file or folder ID
  fields: "id,name,mimeType,size,owners",  // Optional: specific fields
  supports_all_drives: false               // Include shared drives
}
```

### File Upload and Creation Tools

#### `gdrive_upload_file`
Uploads a file to Google Drive.

```typescript
{
  name: "report.pdf",                      // Required: file name
  content: "base64EncodedContent...",      // Required: base64 encoded file content
  mime_type: "application/pdf",            // Required: MIME type
  parent_folder_id: "folder_id_123",       // Optional: parent folder ID
  description: "Monthly report",           // Optional: file description
  starred: false,                          // Optional: star the file
  supports_all_drives: false               // Optional: shared drives support
}
```

**Common MIME types**:
- Text: `text/plain`
- PDF: `application/pdf`
- JPEG: `image/jpeg`
- PNG: `image/png`
- ZIP: `application/zip`
- JSON: `application/json`
- CSV: `text/csv`

#### `gdrive_create_folder`
Creates a new folder in Google Drive.

```typescript
{
  name: "Project Files",                   // Required: folder name
  parent_folder_id: "folder_id_123",       // Optional: parent folder ID
  description: "Project documents",        // Optional: folder description
  starred: false,                          // Optional: star the folder
  supports_all_drives: false               // Optional: shared drives support
}
```

### File Download and Export Tools

#### `gdrive_download_file`
Downloads a file from Google Drive (returns base64 encoded content).

```typescript
{
  file_id: "file_id_123",                  // Required: file ID to download
  mime_type: "application/pdf",            // Optional: export MIME type for Google Workspace files
  supports_all_drives: false               // Optional: shared drives support
}
```

**Note**: For Google Workspace files (Docs, Sheets, Slides), specify `mime_type` to export to desired format.

#### `gdrive_export_file`
Exports a Google Workspace document to a different format.

```typescript
{
  file_id: "doc_id_123",                   // Required: Google Workspace file ID
  mime_type: "application/pdf"             // Required: export MIME type
}
```

**Export formats for Google Docs**:
- PDF: `application/pdf`
- Plain text: `text/plain`
- Rich text: `application/rtf`
- Word: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- HTML: `text/html`
- EPUB: `application/epub+zip`

**Export formats for Google Sheets**:
- PDF: `application/pdf`
- Excel: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- CSV: `text/csv`
- TSV: `text/tab-separated-values`
- HTML: `text/html`
- ODS: `application/vnd.oasis.opendocument.spreadsheet`

**Export formats for Google Slides**:
- PDF: `application/pdf`
- PowerPoint: `application/vnd.openxmlformats-officedocument.presentationml.presentation`
- Plain text: `text/plain`
- ODP: `application/vnd.oasis.opendocument.presentation`

### File Management Tools

#### `gdrive_update_file`
Updates file metadata or content.

```typescript
{
  file_id: "file_id_123",                  // Required: file ID
  name: "new_name.pdf",                    // Optional: new file name
  description: "Updated description",      // Optional: new description
  content: "base64EncodedContent...",      // Optional: new content
  mime_type: "application/pdf",            // Required if updating content
  starred: true,                           // Optional: star/unstar
  trashed: false,                          // Optional: trash/restore
  add_parents: ["folder_id_456"],          // Optional: add to folders
  remove_parents: ["folder_id_789"],       // Optional: remove from folders
  supports_all_drives: false               // Optional: shared drives support
}
```

#### `gdrive_copy_file`
Creates a copy of a file.

```typescript
{
  file_id: "file_id_123",                  // Required: file ID to copy
  name: "Copy of report.pdf",              // Optional: name for copy
  parent_folder_id: "folder_id_456",       // Optional: destination folder
  supports_all_drives: false               // Optional: shared drives support
}
```

#### `gdrive_trash_file`
Moves a file to trash (can be restored later).

```typescript
{
  file_id: "file_id_123",                  // Required: file or folder ID
  supports_all_drives: false               // Optional: shared drives support
}
```

#### `gdrive_delete_file`
Permanently deletes a file from Google Drive (bypasses trash, cannot be undone).

```typescript
{
  file_id: "file_id_123",                  // Required: file or folder ID
  supports_all_drives: false               // Optional: shared drives support
}
```

### Sharing and Permissions Tools

#### `gdrive_share_file`
Creates a permission to share a file or folder.

```typescript
{
  file_id: "file_id_123",                  // Required: file or folder ID
  role: "reader",                          // Required: owner, organizer, fileOrganizer, writer, commenter, reader
  type: "user",                            // Required: user, group, domain, anyone
  email_address: "user@example.com",       // Required for type=user or group
  domain: "example.com",                   // Required for type=domain
  send_notification_email: true,           // Optional: send notification
  email_message: "Check this out!",        // Optional: custom message
  supports_all_drives: false               // Optional: shared drives support
}
```

**Permission roles**:
- `owner` - Full ownership (can only transfer ownership)
- `organizer` - Can organize files in shared drives
- `fileOrganizer` - Can organize files
- `writer` - Can edit and comment
- `commenter` - Can comment only
- `reader` - Can view only

**Permission types**:
- `user` - Share with specific user (requires email_address)
- `group` - Share with Google Group (requires email_address)
- `domain` - Share with entire domain (requires domain)
- `anyone` - Make publicly accessible

**Common sharing scenarios**:
- Share with specific user: `{ type: "user", email_address: "user@example.com", role: "reader" }`
- Make public (read-only): `{ type: "anyone", role: "reader" }`
- Share with domain: `{ type: "domain", domain: "company.com", role: "writer" }`

#### `gdrive_list_permissions`
Lists all permissions for a file or folder.

```typescript
{
  file_id: "file_id_123",                  // Required: file or folder ID
  supports_all_drives: false               // Optional: shared drives support
}
```

#### `gdrive_remove_permission`
Removes a permission from a file or folder.

```typescript
{
  file_id: "file_id_123",                  // Required: file or folder ID
  permission_id: "permission_id_456",      // Required: permission ID to remove
  supports_all_drives: false               // Optional: shared drives support
}
```

## Testing

Run the OAuth flow test:

```bash
export API_KEY=your_api_key
export GOOGLE_DRIVE_CLIENT_ID=your_client_id
export GOOGLE_DRIVE_CLIENT_SECRET=your_client_secret

./scripts/test-google-drive-oauth.sh
```

The test script will:
1. Verify API health
2. Check Google Drive service configuration
3. Initiate OAuth flow
4. Guide you through Google authorization
5. Verify credentials storage and encryption
6. Test Google Drive API calls
7. Verify required scopes
8. Test file listing and operations

## Usage Examples

### Listing Files

```bash
# List all files in root
curl https://api.authlane.com/api/v1/users/user_123/tools/gdrive_list_files \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{}'

# List files in specific folder
curl https://api.authlane.com/api/v1/users/user_123/tools/gdrive_list_files \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "folder_id": "folder_id_123",
    "max_results": 50
  }'
```

### Searching Files

```bash
# Search for PDFs containing "report"
curl https://api.authlane.com/api/v1/users/user_123/tools/gdrive_search_files \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "name contains '\''report'\'' and mimeType = '\''application/pdf'\''",
    "max_results": 20
  }'

# Find recently modified images
curl https://api.authlane.com/api/v1/users/user_123/tools/gdrive_search_files \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "mimeType contains '\''image/'\'' and modifiedTime > '\''2024-01-01T00:00:00'\''",
    "order_by": "modifiedTime desc"
  }'
```

### Uploading Files

```bash
# Upload a text file
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gdrive_upload_file \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "report.txt",
    "content": "SGVsbG8sIFdvcmxkIQ==",
    "mime_type": "text/plain",
    "description": "Monthly report"
  }'

# Upload to specific folder
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gdrive_upload_file \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "document.pdf",
    "content": "JVBERi0xLjQK...",
    "mime_type": "application/pdf",
    "parent_folder_id": "folder_id_123"
  }'
```

### Creating Folders

```bash
# Create a folder
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gdrive_create_folder \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Project Documents",
    "description": "All project files"
  }'

# Create nested folder
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gdrive_create_folder \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Archived",
    "parent_folder_id": "parent_folder_id"
  }'
```

### Downloading Files

```bash
# Download a regular file
curl https://api.authlane.com/api/v1/users/user_123/tools/gdrive_download_file \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "file_id_123"
  }'

# Export Google Doc as PDF
curl https://api.authlane.com/api/v1/users/user_123/tools/gdrive_export_file \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "doc_id_123",
    "mime_type": "application/pdf"
  }'
```

### Sharing Files

```bash
# Share with specific user (read-only)
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gdrive_share_file \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "file_id_123",
    "role": "reader",
    "type": "user",
    "email_address": "colleague@example.com",
    "send_notification_email": true,
    "email_message": "Here'\''s the document you requested"
  }'

# Make file publicly accessible
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gdrive_share_file \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "file_id_123",
    "role": "reader",
    "type": "anyone"
  }'
```

### Managing Files

```bash
# Rename a file
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gdrive_update_file \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "file_id_123",
    "name": "new_name.pdf"
  }'

# Move file to trash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gdrive_trash_file \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "file_id_123"
  }'

# Copy a file
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gdrive_copy_file \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "file_id": "file_id_123",
    "name": "Copy of document.pdf",
    "parent_folder_id": "destination_folder_id"
  }'
```

## Google Drive API Documentation

- [Google Drive API Reference](https://developers.google.com/drive/api/reference/rest/v3)
- [Google Drive API Guides](https://developers.google.com/drive/api/guides/about-sdk)
- [Search Query Language](https://developers.google.com/drive/api/guides/search-files)
- [OAuth 2.0 Scopes](https://developers.google.com/drive/api/guides/api-specific-auth)
- [MIME Types](https://developers.google.com/drive/api/guides/mime-types)
- [Export MIME Types](https://developers.google.com/drive/api/guides/ref-export-formats)

## Troubleshooting

### Access Not Configured Error

If you get an "access not configured" error:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **Library**
4. Search for "Google Drive API" and click **Enable**

### Insufficient Permission Error

If you get an "insufficient permission" error:
1. Check that you've requested the correct scopes during OAuth
2. Go to **OAuth consent screen** and verify scopes are added
3. Revoke and re-authorize the connection in Authlane
4. Ensure you have the necessary permissions in Google Drive for the operation

### File Not Found Error

This usually means:
1. The file ID is incorrect or the file has been deleted
2. You don't have permission to access the file
3. The file is in a shared drive but you didn't set `supports_all_drives: true`

### Invalid MIME Type Error

When exporting Google Workspace files:
1. Verify the MIME type is valid for the file type
2. Check [export formats documentation](https://developers.google.com/drive/api/guides/ref-export-formats)
3. Regular files cannot be exported, only Google Workspace files

### Quota Exceeded Error

Google Drive API has usage quotas:
- **Queries per day**: 1,000,000,000
- **Queries per 100 seconds per user**: 1,000

See [Google Drive API Usage Limits](https://developers.google.com/drive/api/guides/limits) for details.

### App Not Verified Warning

If users see "This app isn't verified":
1. This is normal for apps in testing mode
2. Click "Advanced" → "Go to [Your App] (unsafe)"
3. For production, submit your app for [verification](https://support.google.com/cloud/answer/9110914)

## Common MIME Types

### Documents
- Google Docs: `application/vnd.google-apps.document`
- Microsoft Word: `application/vnd.openxmlformats-officedocument.wordprocessingml.document`
- PDF: `application/pdf`
- Plain text: `text/plain`
- Rich text: `application/rtf`

### Spreadsheets
- Google Sheets: `application/vnd.google-apps.spreadsheet`
- Microsoft Excel: `application/vnd.openxmlformats-officedocument.spreadsheetml.sheet`
- CSV: `text/csv`

### Presentations
- Google Slides: `application/vnd.google-apps.presentation`
- Microsoft PowerPoint: `application/vnd.openxmlformats-officedocument.presentationml.presentation`

### Images
- JPEG: `image/jpeg`
- PNG: `image/png`
- GIF: `image/gif`
- SVG: `image/svg+xml`

### Archives
- ZIP: `application/zip`
- TAR: `application/x-tar`
- GZIP: `application/gzip`

### Other
- Folder: `application/vnd.google-apps.folder`
- JSON: `application/json`
- XML: `application/xml`
- Video: `video/mp4`, `video/quicktime`
- Audio: `audio/mpeg`, `audio/wav`

## Rate Limits

Google Drive API quota costs per operation:
- **Query operations** (list, get): 1 quota unit
- **Mutation operations** (create, update, delete): 3 quota units
- **Download operations**: 2 quota units per GB
- **Upload operations**: 20 quota units per GB

Monitor your quota in the [Google Cloud Console](https://console.cloud.google.com/apis/api/drive.googleapis.com/quotas).

## Security Considerations

- Always use HTTPS for redirect URIs in production
- Keep your client secret secure and never expose it client-side
- Use minimal scopes required for your use case
- Consider using `drive.file` scope instead of full `drive` access when possible
- Regularly review authorized applications in Google Account settings
- Implement proper token refresh logic to maintain access
- Enable two-factor authentication on your Google account
- Monitor API usage for unusual activity
- Be cautious when granting `anyone` permissions (public access)
- Regularly audit file and folder permissions

## Best Practices

1. **Use minimal scopes**: Only request scopes you need
2. **Handle pagination**: Large drives require pagination for listing files
3. **Implement retry logic**: Handle temporary API failures with exponential backoff
4. **Cache file metadata**: Reduce API calls by caching file information
5. **Use batch requests**: Combine multiple operations when possible
6. **Respect rate limits**: Implement rate limiting and backoff strategies
7. **Handle errors gracefully**: Provide user-friendly error messages
8. **Validate file IDs**: Always validate file IDs before operations
9. **Use specific queries**: Narrow searches to reduce results and improve performance
10. **Monitor quotas**: Track API usage to avoid hitting limits
11. **Clean up permissions**: Remove unnecessary sharing permissions regularly
12. **Test with various file types**: Ensure your app handles all file types correctly
13. **Implement progress tracking**: For large uploads/downloads, show progress to users
14. **Handle shared drives**: Set `supports_all_drives: true` when needed
15. **Validate MIME types**: Ensure correct MIME types for uploads and exports
