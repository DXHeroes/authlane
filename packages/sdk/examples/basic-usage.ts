/**
 * Basic usage example for @authlane/sdk
 *
 * This example demonstrates:
 * - Initializing the Authlane client
 * - Listing available services
 * - Checking user connections
 * - Getting credentials
 * - Checking connection health
 * - Getting AI agent tools
 */

import { Authlane } from '@authlane/sdk';

async function main() {
  // Initialize the Authlane client
  const authlane = new Authlane({
    apiKey: process.env.AUTHLANE_API_KEY || 'your_api_key',
    baseUrl: process.env.AUTHLANE_BASE_URL || 'http://localhost:3000',
  });

  const userId = 'user_123';

  console.log('🚀 Authlane SDK Example\n');

  // 1. List all available services
  console.log('1️⃣  Listing available services...');
  const { data: services, error: servicesError } = await authlane.services.list();

  if (servicesError) {
    console.error('❌ Error:', servicesError.message);
  } else {
    console.log(`✅ Found ${services?.length} services:`);
    services?.forEach((service) => {
      console.log(`   - ${service.name} (${service.id}) - ${service.authType}`);
    });
  }

  console.log('\n');

  // 2. List user connections
  console.log('2️⃣  Listing connections for user:', userId);
  const { data: connections, error: connectionsError } = await authlane.connections.list({
    userId,
  });

  if (connectionsError) {
    console.error('❌ Error:', connectionsError.message);
  } else {
    console.log(`✅ Found ${connections?.length} connections:`);
    connections?.forEach((conn) => {
      console.log(`   - ${conn.serviceId} (${conn.status})`);
    });
  }

  console.log('\n');

  // 3. Get specific connection
  console.log('3️⃣  Getting GitHub connection...');
  const { data: githubConn, error: githubError } = await authlane.connections.get({
    userId,
    serviceId: 'github',
  });

  if (githubError) {
    console.error('❌ Error:', githubError.message, `(${githubError.code})`);
  } else if (githubConn) {
    console.log('✅ GitHub connection found:');
    console.log(`   Status: ${githubConn.status}`);
    console.log(`   Connected: ${githubConn.connectedAt}`);
    console.log(`   Expires: ${githubConn.expiresAt || 'Never'}`);
  }

  console.log('\n');

  // 4. Check connection health
  console.log('4️⃣  Checking GitHub connection health...');
  const { data: health, error: healthError } = await authlane.connections.health({
    userId,
    serviceId: 'github',
  });

  if (healthError) {
    console.error('❌ Error:', healthError.message);
  } else if (health) {
    console.log(`✅ Health status: ${health.status}`);
    console.log(`   Connection status: ${health.connection_status}`);
    console.log(`   Last verified: ${health.last_verified}`);
  }

  console.log('\n');

  // 5. Get credentials (if connected)
  if (githubConn?.status === 'connected') {
    console.log('5️⃣  Getting GitHub credentials...');
    const { data: credentials, error: credsError } = await authlane.connections.getCredentials({
      userId,
      serviceId: 'github',
    });

    if (credsError) {
      console.error('❌ Error:', credsError.message);
    } else if (credentials && 'access_token' in credentials) {
      console.log('✅ Credentials retrieved:');
      console.log(`   Access token: ${credentials.access_token.substring(0, 10)}...`);
      console.log(`   Expires at: ${credentials.expires_at || 'N/A'}`);
    }
  } else {
    console.log('5️⃣  Skipping credentials (GitHub not connected)');
  }

  console.log('\n');

  // 6. Get AI agent tools in MCP format
  console.log('6️⃣  Getting tools in MCP format...');
  const { data: mcpTools, error: mcpError } = await authlane.tools.list({
    userId,
    format: 'mcp',
  });

  if (mcpError) {
    console.error('❌ Error:', mcpError.message);
  } else if (mcpTools && 'tools' in mcpTools) {
    console.log(`✅ Found ${mcpTools.tools.length} MCP tools:`);
    mcpTools.tools.slice(0, 3).forEach((tool) => {
      console.log(`   - ${tool.name}: ${tool.description}`);
    });
    if (mcpTools.tools.length > 3) {
      console.log(`   ... and ${mcpTools.tools.length - 3} more`);
    }
  }

  console.log('\n');

  // 7. Get AI agent tools in OpenAI format
  console.log('7️⃣  Getting tools in OpenAI format...');
  const { data: openaiTools, error: openaiError } = await authlane.tools.list({
    userId,
    format: 'openai',
  });

  if (openaiError) {
    console.error('❌ Error:', openaiError.message);
  } else if (openaiTools && 'functions' in openaiTools) {
    console.log(`✅ Found ${openaiTools.functions.length} OpenAI functions:`);
    openaiTools.functions.slice(0, 3).forEach((func) => {
      console.log(`   - ${func.name}: ${func.description}`);
    });
    if (openaiTools.functions.length > 3) {
      console.log(`   ... and ${openaiTools.functions.length - 3} more`);
    }
  }

  console.log('\n✨ Example complete!\n');
}

// Run the example
main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
