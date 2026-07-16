import { lookup as dnsLookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';

type Address = { address: string; family: number };
type LookupAll = (hostname: string) => Promise<Address[]>;

export function validateWebhookUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('Webhook URL is invalid');
  }
  if (url.protocol !== 'https:') throw new Error('Webhook URL must use HTTPS');
  if (url.username || url.password) throw new Error('Webhook URL must not contain credentials');
  if (url.port && url.port !== '443')
    throw new Error('Webhook URL must use the default HTTPS port');
  if (url.hash) throw new Error('Webhook URL must not contain a fragment');
  if (url.toString().length > 2_048) throw new Error('Webhook URL is too long');
  if (url.hostname === 'localhost' || url.hostname.endsWith('.localhost')) {
    throw new Error('Webhook host must resolve to a public IP address');
  }
  return url;
}

function isPublicIp(address: string): boolean {
  if (isIP(address) === 4) {
    const [a = 0, b = 0, c = 0] = address.split('.').map(Number);
    return !(
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0 && (c === 0 || c === 2)) ||
      (a === 198 && (b === 18 || b === 19 || (b === 51 && c === 100))) ||
      (a === 203 && b === 0 && c === 113) ||
      a >= 224
    );
  }
  if (isIP(address) === 6) {
    const normalized = address.toLowerCase();
    return !(
      normalized === '::' ||
      normalized === '::1' ||
      normalized.startsWith('fc') ||
      normalized.startsWith('fd') ||
      normalized.startsWith('fe8') ||
      normalized.startsWith('fe9') ||
      normalized.startsWith('fea') ||
      normalized.startsWith('feb') ||
      normalized.startsWith('ff') ||
      normalized.startsWith('2001:db8:') ||
      normalized.startsWith('::ffff:127.') ||
      normalized.startsWith('::ffff:10.') ||
      normalized.startsWith('::ffff:192.168.')
    );
  }
  return false;
}

export async function resolvePublicWebhookAddress(
  url: URL,
  lookupAll: LookupAll = async (hostname) => dnsLookup(hostname, { all: true, verbatim: true })
): Promise<Address> {
  const addresses = await lookupAll(url.hostname);
  if (addresses.length === 0 || addresses.some(({ address }) => !isPublicIp(address))) {
    throw new Error('Webhook host must resolve only to public IP addresses');
  }
  return addresses[0]!;
}

export async function postWebhook(
  rawUrl: string,
  headers: Record<string, string>,
  body: string
): Promise<{ ok: boolean; status: number }> {
  const url = validateWebhookUrl(rawUrl);
  const resolved = await resolvePublicWebhookAddress(url);
  return new Promise((resolve, reject) => {
    const outgoing = request(
      url,
      {
        method: 'POST',
        headers: { ...headers, 'Content-Length': Buffer.byteLength(body).toString() },
        servername: url.hostname,
        lookup: (_hostname, _options, callback) => {
          callback(null, resolved.address, resolved.family);
        },
        timeout: 10_000,
      },
      (response) => {
        response.resume();
        response.on('end', () => {
          const status = response.statusCode ?? 0;
          resolve({ ok: status >= 200 && status < 300, status });
        });
      }
    );
    outgoing.on('timeout', () => outgoing.destroy(new Error('Webhook request timed out')));
    outgoing.on('error', reject);
    outgoing.end(body);
  });
}
