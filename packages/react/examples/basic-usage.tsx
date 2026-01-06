/**
 * Basic usage example
 */

import { AuthlaneProvider, ConnectionButton, ConnectionList } from '@authlane/react';

export default function App() {
  // Get current user from your auth system
  const currentUser = {
    id: 'user_123',
  };

  return (
    <AuthlaneProvider publicKey={process.env.AUTHLANE_PUBLIC_KEY!} userId={currentUser.id}>
      <div style={{ padding: '20px' }}>
        <h1>My Integrations</h1>

        <div style={{ marginBottom: '20px' }}>
          <h2>Connect Services</h2>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <ConnectionButton
              service="github"
              onSuccess={(connection) => {
                console.log('Connected to GitHub!', connection);
                alert('Successfully connected to GitHub!');
              }}
              onError={(error) => {
                console.error('Failed to connect:', error);
                alert(`Failed to connect: ${error.message}`);
              }}
            >
              Connect GitHub
            </ConnectionButton>

            <ConnectionButton service="slack">Connect Slack</ConnectionButton>

            <ConnectionButton service="linear">Connect Linear</ConnectionButton>
          </div>
        </div>

        <div>
          <h2>Your Connections</h2>
          <ConnectionList
            onDisconnect={(serviceId) => {
              console.log('Disconnected from', serviceId);
            }}
          />
        </div>
      </div>
    </AuthlaneProvider>
  );
}
