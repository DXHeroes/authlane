import type {
  UserScopeCapabilities,
  UserScopeCredentialLeases,
  UserScopeTools,
} from '../src/index.js';

type CapabilityOptions = NonNullable<Parameters<UserScopeCapabilities['get']>[0]>;
type ToolOptions = NonNullable<Parameters<UserScopeTools['list']>[0]>;
type CredentialLeaseOptions = Parameters<UserScopeCredentialLeases['create']>[0];

const validCapabilityOptions: CapabilityOptions = {};
const validToolOptions: ToolOptions = { format: 'openai' };
const validCredentialLeaseOptions: CredentialLeaseOptions = { serviceId: 'github' };

const widenedCapabilityOptions = {
  format: 'mcp' as const,
  externalUserId: 'other-user',
};
const widenedToolOptions = {
  format: 'openai' as const,
  externalUserId: 'other-user',
};
const widenedCredentialLeaseOptions = {
  serviceId: 'github',
  externalUserId: 'other-user',
};

// @ts-expect-error A user scope must not accept an external user ID override.
const rejectedCapabilityOptions: CapabilityOptions = widenedCapabilityOptions;
// @ts-expect-error A user scope must not accept an external user ID override.
const rejectedToolOptions: ToolOptions = widenedToolOptions;
// @ts-expect-error A user scope must not accept an external user ID override.
const rejectedCredentialLeaseOptions: CredentialLeaseOptions = widenedCredentialLeaseOptions;

void validCapabilityOptions;
void validToolOptions;
void validCredentialLeaseOptions;
void rejectedCapabilityOptions;
void rejectedToolOptions;
void rejectedCredentialLeaseOptions;
