import { computeMD5 } from './md5';

/**
 * Computes a SHA-256 hex string from a Uint8Array.
 * Uses the native Web Crypto API (crypto.subtle).
 */
export async function computeSHA256(data: Uint8Array): Promise<string> {
  const buffer = data.buffer.slice(data.byteOffset, data.byteOffset + data.byteLength) as ArrayBuffer;
  const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
}

export { computeMD5 };
