# Issue a credential lease

Issue audited access-only credential material to a trusted server-side caller

Issues access-only credential material to a trusted server-side caller. Requires
`credentials:issue`. The audited response uses `Cache-Control: no-store, private`
and never contains OAuth refresh tokens, ID tokens, or provider client secrets.

Do not call this endpoint from a browser and do not persist the response. Use the
lease only for the immediate provider request in your SaaS backend.
