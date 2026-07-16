import { BlockList, isIP } from 'node:net';

function normalize(address: string): string {
  return address.startsWith('::ffff:') && isIP(address.slice(7)) === 4 ? address.slice(7) : address;
}

function trustedProxyList(cidrs: string[]): BlockList {
  const list = new BlockList();
  for (const cidr of cidrs) {
    const [rawNetwork, rawPrefix] = cidr.trim().split('/');
    const network = normalize(rawNetwork || '');
    const family = isIP(network);
    const prefix = Number(rawPrefix ?? (family === 4 ? 32 : 128));
    if (
      (family === 4 && prefix >= 0 && prefix <= 32) ||
      (family === 6 && prefix >= 0 && prefix <= 128)
    ) {
      list.addSubnet(network, prefix, family === 4 ? 'ipv4' : 'ipv6');
    }
  }
  return list;
}

export function resolveClientIp(
  remoteAddress: string | undefined,
  forwardedFor: string | undefined,
  trustedProxyCidrs: string[]
): string {
  const remote = normalize(remoteAddress || '');
  if (!isIP(remote)) return 'unknown';
  const trusted = trustedProxyList(trustedProxyCidrs);
  const remoteFamily = isIP(remote) === 4 ? 'ipv4' : 'ipv6';
  if (!trusted.check(remote, remoteFamily) || !forwardedFor) return remote;

  const forwarded = forwardedFor.split(',').map((value) => normalize(value.trim()));
  if (forwarded.some((address) => !isIP(address))) return remote;
  const chain = [...forwarded, remote];
  for (let index = chain.length - 1; index >= 0; index -= 1) {
    const address = chain[index];
    if (!address) continue;
    const family = isIP(address) === 4 ? 'ipv4' : 'ipv6';
    if (!trusted.check(address, family)) return address;
  }
  return forwarded[0] || remote;
}
