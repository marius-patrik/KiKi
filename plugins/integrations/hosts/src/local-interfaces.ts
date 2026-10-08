/**
 * Local network interface scanner.
 */

import { networkInterfaces } from "node:os";

interface LocalInterfaceInfo {
  name: string;
  address: string;
  family: string;
  internal: boolean;
}

/** scanLocalInterfaces implementation. */
function scanLocalInterfaces(): LocalInterfaceInfo[] {
  const ifaces = networkInterfaces();
  const results: LocalInterfaceInfo[] = [];

  for (const name of Object.keys(ifaces)) {
    const list = ifaces[name];
    if (!list) continue;
    for (const info of list) {
      if (info.family === "IPv4" && !info.internal) {
        results.push({
          name,
          address: info.address,
          family: info.family,
          internal: info.internal,
        });
      }
    }
  }

  return results;
}

/**
 * Returns the primary LAN IP address if found; otherwise, returns undefined.
 * Guarantees: Returns a string representing the IP address or undefined if not found.
 * Failure Path: Returns undefined if no suitable interface is found.
 */
export function getPrimaryLanIp(): string | undefined {
  const list = scanLocalInterfaces();
  const preferred = list.find((i) => i.name === "en0" || i.name === "eth0" || i.name === "wlan0");
  return preferred?.address || list[0]?.address;
}
