# Jira OAuth setup

Register this callback in the Jira OAuth application:

```text
https://authlane.example.com/api/v1/oauth/jira/callback
```

For local development use `http://localhost:3000/api/v1/oauth/jira/callback`.

Enable Jira in the Authlane dashboard and enter the Jira client ID, client secret, and required scopes. Your SaaS must create a short-lived connect session for the end-user; the hosted connect UI performs authorization with PKCE and state validation.

The complete maintained flow is documented in [`apps/docs/guides/oauth-setup.mdx`](../../apps/docs/guides/oauth-setup.mdx).
