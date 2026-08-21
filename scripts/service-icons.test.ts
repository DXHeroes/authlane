import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { SERVICE_ICON_ETAG, SERVICE_ICON_SVG } from '../apps/api/src/generated/service-icons.js';
import { productionServices } from '../packages/database/src/seed.js';
import { SUPPORTED_SERVICE_IDS } from '../packages/shared/src/supported-services.js';

const root = resolve(import.meta.dirname, '..');
const generator = resolve(root, 'scripts/generate-service-icons.mjs');

const iconPath = (id: string) => resolve(root, 'integrations', id, 'icon.svg');

describe('service icons', () => {
  it('has a generated module that matches the icons on disk', () => {
    // Four generators now feed this repo. Without a check gate, a corrected mark ships as a stale
    // compiled map and nobody notices until a card renders the old one.
    expect(() => execFileSync('node', [generator, '--check'], { cwd: root })).not.toThrow();
  });

  it('compiles in every icon that exists, and only those', () => {
    const onDisk = SUPPORTED_SERVICE_IDS.filter((id) => existsSync(iconPath(id)));

    expect(Object.keys(SERVICE_ICON_SVG).sort()).toEqual([...onDisk].sort());
    expect(Object.keys(SERVICE_ICON_ETAG).sort()).toEqual([...onDisk].sort());
  });

  it('never promises a mark the route would answer 404 for', () => {
    // The contract a consumer reads is that a non-null iconUrl means a mark exists. Seeding a path
    // for all eighteen would break it for the seven that ship none.
    for (const service of productionServices) {
      if (SERVICE_ICON_SVG[service.id]) {
        expect(service.iconPath).toBe(`/service-icons/${service.id}.svg`);
      } else {
        expect(service.iconPath).toBeNull();
      }
    }
  });

  it('leaves a service without a mark renderable from its initials', () => {
    // Simple Icons does not carry Slack, Salesforce, Pipedrive, Attio, or the Microsoft marks:
    // their owners asked to be removed from the set. Those services ship no icon on purpose and
    // must still have something a card can draw.
    for (const service of productionServices) {
      if (SERVICE_ICON_SVG[service.id]) continue;
      expect(service.initials).toMatch(/^[A-Z0-9]{1,2}$/);
    }
  });

  it('refuses an icon that could carry behaviour', () => {
    // An SVG served from the API's own origin is same-origin markup. The generator fails the build
    // rather than stripping anything, so what ships is what somebody reviewed.
    const inert = readFileSync(iconPath('github'), 'utf8');

    expect(inert).not.toMatch(/<script[\s>]/i);
    expect(inert).not.toMatch(/\son[a-z]+\s*=/i);
    expect(inert).not.toMatch(/javascript:/i);
    expect(inert).not.toMatch(/<foreignObject[\s>]/i);
  });

  it('gives every icon a viewBox, so it scales to the box a card gives it', () => {
    for (const svg of Object.values(SERVICE_ICON_SVG)) {
      expect(svg).toMatch(/<svg[^>]*\sviewBox\s*=/i);
    }
  });

  it('gives every icon a strong validator', () => {
    for (const etag of Object.values(SERVICE_ICON_ETAG)) {
      expect(etag).toMatch(/^"[0-9a-f]{32}"$/);
    }
  });
});
