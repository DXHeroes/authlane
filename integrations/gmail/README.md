# Gmail Integration

OAuth 2.0 integration for Gmail with comprehensive email management, sending, and search capabilities.

## Features

- **Email Sending**: Send emails with attachments, HTML formatting, and CC/BCC
- **Email Reading**: Read emails with filtering and pagination
- **Email Search**: Search emails using Gmail's powerful query syntax
- **Label Management**: Create, list, and manage Gmail labels
- **Email Management**: Mark as read/unread, archive, star, trash, and delete
- **Thread Support**: Reply to email threads and get thread details
- **Draft Management**: Create and manage email drafts

## OAuth Configuration

### Creating a Google Cloud Project

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

**Minimum required scopes**:
- `https://www.googleapis.com/auth/gmail.send` - Send email on behalf of user
- `https://www.googleapis.com/auth/gmail.readonly` - Read email messages and settings

**Additional recommended scopes**:
- `https://www.googleapis.com/auth/gmail.modify` - Read, write, and send email, and modify labels
- `https://www.googleapis.com/auth/gmail.compose` - Manage drafts and send emails
- `https://www.googleapis.com/auth/gmail.labels` - Manage mailbox labels

### Creating OAuth 2.0 Client ID

1. Go to **APIs & Services** → **Credentials**
2. Click **Create Credentials** → **OAuth client ID**
3. Select **Web application**
4. Add your redirect URI:
   ```
   http://localhost:3000/api/v1/users/{user_id}/connections/gmail/callback
   ```
5. Click **Create** and save your Client ID and Client Secret

### Enable Gmail API

1. Go to **APIs & Services** → **Library**
2. Search for "Gmail API"
3. Click **Enable**

### Environment Variables

Set the following environment variables:

```bash
GMAIL_CLIENT_ID=your_client_id.apps.googleusercontent.com
GMAIL_CLIENT_SECRET=your_client_secret
```

## Available Tools

### Email Sending Tools

#### `gmail_send_email`
Send an email via Gmail.

```typescript
{
  to: ["recipient@example.com"],           // Required: recipient emails
  subject: "Email Subject",                // Required: subject line
  body: "Email body content",              // Required: email body
  cc: ["cc@example.com"],                  // Optional: CC recipients
  bcc: ["bcc@example.com"],                // Optional: BCC recipients
  html: false,                             // Optional: body is HTML
  attachments: [                           // Optional: attachments
    {
      filename: "document.pdf",
      content: "base64EncodedContent",     // Base64 encoded
      mimeType: "application/pdf"
    }
  ],
  reply_to: "reply@example.com",           // Optional: reply-to address
  thread_id: "thread_123",                 // Optional: reply to thread
  label_ids: ["SENT", "IMPORTANT"]         // Optional: labels to apply
}
```

#### `gmail_create_draft`
Create a draft email.

```typescript
{
  to: ["recipient@example.com"],           // Required: recipient emails
  subject: "Draft Subject",                // Required: subject line
  body: "Draft body content",              // Required: email body
  cc: ["cc@example.com"],                  // Optional: CC recipients
  bcc: ["bcc@example.com"],                // Optional: BCC recipients
  html: false                              // Optional: body is HTML
}
```

### Email Reading Tools

#### `gmail_read_emails`
Read emails from Gmail inbox or specific folder.

```typescript
{
  max_results: 10,                         // Max emails to return (default: 10, max: 500)
  label_ids: ["INBOX", "UNREAD"],          // Filter by labels
  include_spam_trash: false,               // Include spam/trash
  page_token: "...",                       // Pagination token
  format: "full",                          // Email format: minimal, full, raw, metadata
  metadata_headers: ["From", "To"]         // Headers (when format=metadata)
}
```

**Common label IDs**:
- `INBOX` - Inbox
- `UNREAD` - Unread emails
- `STARRED` - Starred emails
- `IMPORTANT` - Important emails
- `SENT` - Sent emails
- `DRAFT` - Draft emails
- `SPAM` - Spam folder
- `TRASH` - Trash folder

#### `gmail_get_email`
Get a specific email by ID.

```typescript
{
  id: "msg_123456789",                     // Required: message ID
  format: "full",                          // Email format
  metadata_headers: ["From", "Subject"]    // Headers (when format=metadata)
}
```

#### `gmail_get_thread`
Get an email thread by ID.

```typescript
{
  id: "thread_123456789",                  // Required: thread ID
  format: "full",                          // Email format
  metadata_headers: ["From", "To"]         // Headers (when format=metadata)
}
```

### Email Search Tools

#### `gmail_search_emails`
Search emails using Gmail search syntax.

```typescript
{
  query: "from:user@example.com subject:meeting", // Required: search query
  max_results: 10,                         // Max results (default: 10, max: 500)
  label_ids: ["INBOX"],                    // Filter by labels
  include_spam_trash: false,               // Include spam/trash
  page_token: "...",                       // Pagination token
  format: "full"                           // Email format
}
```

**Gmail search operators**:
- `from:user@example.com` - From specific sender
- `to:user@example.com` - To specific recipient
- `subject:keyword` - Subject contains keyword
- `is:unread` - Unread emails
- `is:starred` - Starred emails
- `has:attachment` - Has attachments
- `after:2024/01/01` - After date
- `before:2024/12/31` - Before date
- `newer_than:7d` - Newer than 7 days
- `older_than:30d` - Older than 30 days
- `label:work` - Has label "work"

See [Gmail Search Operators](https://support.google.com/mail/answer/7190) for full list.

### Email Management Tools

#### `gmail_modify_email`
Modify labels on an email (mark read/unread, archive, star, etc.).

```typescript
{
  id: "msg_123456789",                     // Required: message ID
  add_label_ids: ["STARRED", "IMPORTANT"], // Labels to add
  remove_label_ids: ["UNREAD", "INBOX"]    // Labels to remove
}
```

**Common operations**:
- Mark as read: `{ remove_label_ids: ["UNREAD"] }`
- Mark as unread: `{ add_label_ids: ["UNREAD"] }`
- Star: `{ add_label_ids: ["STARRED"] }`
- Archive: `{ remove_label_ids: ["INBOX"] }`
- Mark important: `{ add_label_ids: ["IMPORTANT"] }`

#### `gmail_trash_email`
Move an email to trash.

```typescript
{
  id: "msg_123456789"                      // Required: message ID
}
```

#### `gmail_delete_email`
Permanently delete an email (cannot be undone).

```typescript
{
  id: "msg_123456789"                      // Required: message ID
}
```

### Label Management Tools

#### `gmail_list_labels`
List all labels in the Gmail account.

```typescript
{}  // No parameters required
```

#### `gmail_create_label`
Create a new label.

```typescript
{
  name: "Work/Projects",                   // Required: label name (can use / for nesting)
  label_list_visibility: "labelShow",      // Visibility: labelShow, labelShowIfUnread, labelHide
  message_list_visibility: "show",         // Message list: show, hide
  background_color: "#000000",             // Background color (hex)
  text_color: "#ffffff"                    // Text color (hex)
}
```

### Draft Management Tools

#### `gmail_list_drafts`
List all draft emails.

```typescript
{
  max_results: 10,                         // Max drafts to return (default: 10, max: 500)
  page_token: "..."                        // Pagination token
}
```

## Testing

Run the OAuth flow test:

```bash
export API_KEY=your_api_key
export GMAIL_CLIENT_ID=your_client_id
export GMAIL_CLIENT_SECRET=your_client_secret

./scripts/test-gmail-oauth.sh
```

The test script will:
1. Verify API health
2. Check Gmail service configuration
3. Initiate OAuth flow
4. Guide you through Google authorization
5. Verify credentials storage and encryption
6. Test Gmail API calls
7. Verify required scopes
8. Test reading messages and labels

## Usage Examples

### Sending a Simple Email

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gmail_send_email \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["recipient@example.com"],
    "subject": "Hello from Authlane",
    "body": "This is a test email sent via Authlane Gmail integration."
  }'
```

### Sending an HTML Email with Attachments

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gmail_send_email \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "to": ["recipient@example.com"],
    "subject": "HTML Email with Attachment",
    "body": "<h1>Hello!</h1><p>This is an <strong>HTML</strong> email.</p>",
    "html": true,
    "attachments": [
      {
        "filename": "document.pdf",
        "content": "JVBERi0xLjQK...",
        "mimeType": "application/pdf"
      }
    ]
  }'
```

### Reading Unread Emails

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/gmail_read_emails \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "max_results": 20,
    "label_ids": ["INBOX", "UNREAD"]
  }'
```

### Searching Emails

```bash
curl https://api.authlane.com/api/v1/users/user_123/tools/gmail_search_emails \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "query": "from:boss@company.com is:unread",
    "max_results": 10
  }'
```

### Marking Email as Read and Archiving

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gmail_modify_email \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "id": "msg_123456789",
    "remove_label_ids": ["UNREAD", "INBOX"]
  }'
```

### Creating a Label

```bash
curl -X POST https://api.authlane.com/api/v1/users/user_123/tools/gmail_create_label \
  -H "Authorization: Bearer $API_KEY" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Authlane/Important",
    "label_list_visibility": "labelShow",
    "message_list_visibility": "show"
  }'
```

## Gmail API Documentation

- [Gmail API Reference](https://developers.google.com/gmail/api/reference/rest)
- [Gmail API Guides](https://developers.google.com/gmail/api/guides)
- [Search Operators](https://support.google.com/mail/answer/7190)
- [OAuth 2.0 Scopes](https://developers.google.com/gmail/api/auth/scopes)

## Troubleshooting

### Access Not Configured Error

If you get an "access not configured" error:
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project
3. Navigate to **APIs & Services** → **Library**
4. Search for "Gmail API" and click **Enable**

### Insufficient Permission Error

If you get a "insufficient permission" error:
1. Check that you've requested the correct scopes during OAuth
2. Go to **OAuth consent screen** and verify scopes are added
3. Revoke and re-authorize the connection in Authlane

### Invalid Grant Error

This usually means the authorization code has expired or been used:
1. Authorization codes are single-use only
2. They expire after a few minutes
3. Start a new authorization flow

### Quota Exceeded Error

Gmail API has usage quotas:
- **Daily usage**: 1 billion quota units per day
- **Per-user rate limit**: 250 quota units per second

See [Gmail API Usage Limits](https://developers.google.com/gmail/api/reference/quota) for details.

### App Not Verified Warning

If users see "This app isn't verified":
1. This is normal for apps in testing mode
2. Click "Advanced" → "Go to [Your App] (unsafe)"
3. For production, submit your app for [verification](https://support.google.com/cloud/answer/9110914)

## Rate Limits

Gmail API quota costs per operation:
- **Read operations**: 5 quota units (messages.get, threads.get)
- **List operations**: 5 quota units (messages.list, threads.list)
- **Send operations**: 100 quota units (messages.send)
- **Modify operations**: 50 quota units (messages.modify)

Monitor your quota in the [Google Cloud Console](https://console.cloud.google.com/apis/api/gmail.googleapis.com/quotas).

## Security Considerations

- Always use HTTPS for redirect URIs in production
- Keep your client secret secure and never expose it client-side
- Use minimal scopes required for your use case
- Consider using service accounts for server-to-server applications
- Regularly review authorized applications in Google Account settings
- Implement proper token refresh logic to maintain access
- Enable two-factor authentication on your Google account
- Monitor API usage for unusual activity

## Best Practices

1. **Use minimal scopes**: Only request scopes you need
2. **Handle pagination**: Large mailboxes require pagination
3. **Implement retry logic**: Handle temporary API failures
4. **Cache labels**: Label IDs don't change, cache them
5. **Use batch requests**: Combine multiple operations when possible
6. **Respect rate limits**: Implement exponential backoff
7. **Handle errors gracefully**: Provide user-friendly error messages
8. **Test with various email formats**: HTML, plain text, attachments
