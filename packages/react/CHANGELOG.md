# @authlane/react Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-11-27

### Added

- Initial release of @authlane/react
- `AuthlaneProvider` component for providing Authlane context
- `ConnectionButton` component for OAuth flow
  - Support for popup and redirect modes
  - Loading, success, and error states
  - Custom styling support
- `ConnectionList` component for displaying user connections
  - Connection status badges (connected, expired, error)
  - Disconnect functionality
  - Custom empty state support
- Custom hooks:
  - `useAuthlane` - Access Authlane SDK client
  - `useConnection` - Manage single connection
  - `useConnections` - Manage all connections
- OAuth utilities:
  - `generateAuthorizeUrl` - Generate OAuth URL
  - `openOAuthPopup` - Open OAuth popup
  - `startOAuthPopupFlow` - Start popup OAuth flow
  - `startOAuthRedirectFlow` - Start redirect OAuth flow
  - `parseOAuthCallback` - Parse callback from URL
  - `sendOAuthCallbackToParent` - Send callback to parent window
- TypeScript support with full type definitions
- Unit tests for components and utilities
- Comprehensive documentation and examples

### Dependencies

- React 18+ support
- Integration with @authlane/sdk

[0.1.0]: https://github.com/authlane/authlane/releases/tag/@authlane/react@0.1.0
