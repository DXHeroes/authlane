# Changelog

All notable changes to @authlane/sdk will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.0] - 2025-11-27

### Added

- Initial release of @authlane/sdk
- `Authlane` client class with configuration options
- `ConnectionsResource` with methods:
  - `list()` - List all connections for a user
  - `get()` - Get a specific connection
  - `health()` - Check connection health
  - `delete()` - Delete a connection
- `ServicesResource` with methods:
  - `list()` - List all available services
  - `get()` - Get a specific service
- `ToolsResource` with methods:
  - `list()` - List tools in MCP or OpenAI format
- Supabase-style error handling with `{ data, error }` tuples
- Full TypeScript support with type definitions
- Comprehensive unit tests (23 tests)
- Integration tests for live API testing
- README with usage examples
- Basic usage example

### Features

- Request timeout support (default: 30s)
- Custom base URL support for self-hosted instances
- Network error handling with timeout detection
- Detailed error objects with codes, hints, and documentation links
- Both MCP and OpenAI tool format support

[0.1.0]: https://github.com/authlane/authlane/releases/tag/@authlane/sdk@0.1.0
