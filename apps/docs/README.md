# Authlane Documentation

This directory contains the Mintlify documentation for Authlane.

## Development

Install Mintlify CLI:

```bash
npm install -g mintlify
```

Run development server:

```bash
cd apps/docs
mintlify dev
```

Documentation will be available at http://localhost:3000

## Structure

```
apps/docs/
├── mint.json              # Mintlify configuration
├── introduction.mdx       # Homepage
├── quickstart.mdx         # Quick start guide
├── guides/                # User guides
│   ├── oauth-setup.mdx
│   ├── self-hosting.mdx
│   ├── custom-integrations.mdx
│   ├── security.mdx
│   └── webhooks.mdx
├── sdk/                   # SDK documentation
│   ├── typescript.mdx
│   └── react.mdx
├── integrations/          # Per-integration guides
│   ├── github.mdx
│   ├── slack.mdx
│   └── ...
└── api-reference/         # API documentation
    ├── openapi.yaml
    └── ...
```

## Deployment

The documentation is automatically deployed to docs.authlane.com on push to main branch.

## Contributing

1. Edit .mdx files
2. Test locally with `mintlify dev`
3. Create pull request

## Resources

- [Mintlify Documentation](https://mintlify.com/docs)
- [MDX Guide](https://mdxjs.com/)
