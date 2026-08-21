# Third-party notices

## Service marks in `integrations/*/icon.svg`

The SVG files under `integrations/<id>/icon.svg` are third-party brand marks. **They are not covered
by this repository's MIT license.** Each mark remains the property of its owner and is reproduced
here nominatively — to identify the service an end user is choosing to connect — which is the same
use every integration catalogue makes of them.

The files were taken from [Simple Icons](https://github.com/simple-icons/simple-icons) version
16.28.0, whose SVG files are released under
[CC0 1.0 Universal](https://creativecommons.org/publicdomain/zero/1.0/). The CC0 dedication applies
to Simple Icons' rendering of each mark, not to the trademark itself.

Marks are shipped as published. They are not recoloured, cropped, or reshaped, because several
owners' brand guidelines forbid it.

| Service id | Mark | Colour as shipped | Owner's brand resource |
|---|---|---|---|
| `airtable` | Airtable | `#18bfff` | [brand resource](https://airtable.com/newsroom) |
| `discord` | Discord | `#5865f2` | [brand resource](https://discord.com/branding) |
| `github` | GitHub | `#181717` | [brand resource](https://github.com/logos) |
| `gmail` | Gmail | `#ea4335` | [brand resource](https://fonts.gstatic.com/s/i/productlogos/gmail_2020q4/v8/192px.svg) |
| `google-calendar` | Google Calendar | `#4285f4` | [brand resource](https://fonts.gstatic.com/s/i/productlogos/calendar_2020q4/v8/192px.svg) |
| `google-drive` | Google Drive | `#4285f4` | [brand resource](https://developers.google.com/drive/web/branding) |
| `hubspot` | HubSpot | `#ff7a59` | [brand resource](https://www.hubspot.com/style-guide) |
| `jira` | Jira | `#0052cc` | [brand resource](https://atlassian.design/resources/logo-library) |
| `linear` | Linear | `#5e6ad2` | [brand resource](https://linear.app) |
| `notion` | Notion | `#000000` | [brand resource](https://www.notion.so) |
| `stripe` | Stripe | `#635bff` | [brand resource](https://stripe.com/newsroom/information) |

## Services that ship no mark

Simple Icons does not carry the following marks; most were removed at the owner's request. Authlane
does not redistribute a mark its owner has declined to release, so these services render from their
brand colour and initials instead, and `GET /service-icons/<id>.svg` answers 404 for them.

| Service id | Mark | Owner | Status in Simple Icons |
|---|---|---|---|
| `attio` | Attio | Attio | not in the set |
| `microsoft-calendar` | Microsoft Outlook | Microsoft Corporation | not in the set |
| `microsoft-mail` | Microsoft Outlook | Microsoft Corporation | not in the set |
| `microsoft-sharepoint` | Microsoft SharePoint | Microsoft Corporation | not in the set |
| `pipedrive` | Pipedrive | Pipedrive OÜ | not in the set |
| `salesforce` | Salesforce | Salesforce, Inc. | not in the set |
| `slack` | Slack | Slack Technologies, LLC | not in the set |

Adding one is a matter of dropping `integrations/<id>/icon.svg` in place, running
`pnpm icons:generate`, and recording its provenance in the table above.

## Adding or replacing a mark

1. Take the file from a source whose license permits redistribution, and record that source here.
2. Do not alter the mark's shape or colour.
3. Run `pnpm icons:generate`. The generator rejects anything that could carry behaviour — script
   elements, event handlers, external references — rather than stripping it.
