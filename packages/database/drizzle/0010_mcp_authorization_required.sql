-- An MCP server that refuses an uncredentialed tools/list is working correctly, not failing.
-- Recorded so the dashboard can say a server is waiting for its first authorization rather than
-- showing an empty tool list, which reads as a server that offers nothing.
ALTER TABLE "mcp_servers" ADD COLUMN "authorization_required" boolean DEFAULT false NOT NULL;
