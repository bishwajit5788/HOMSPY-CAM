import type { FirmwareManifest, FirmwareSignature } from '../../types/firmware';

const TRUSTED_KEYS: Record<string, string> = {
  'homspy-release-2026-p256': 'MFkwEwYHKoZIzj0CAQYIKoZIzj0DAQcDQgAE117uuN7i0RySli4hNpswJowSJnG99Wu7jMi6A8s8T/s3lMi/wYDll/w2ciZ9tpPQVfnDVpArH9I186VDSXWnLA==',
};

function canonicalize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalize).join(',')}]`;
  if (value && typeof value === 'object') {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${canonicalize(record[key])}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function base64ToBytes(value: string): Uint8Array<ArrayBuffer> {
  const binary = atob(value);
  const buffer = new ArrayBuffer(binary.length);
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function withoutSignature(manifest: FirmwareManifest): FirmwareManifest {
  const { signature: _signature, ...unsigned } = manifest;
  return unsigned;
}

export function canonicalizeManifest(manifest: FirmwareManifest): string {
  return canonicalize(withoutSignature(manifest));
}

export async function verifyManifestSignature(manifest: FirmwareManifest): Promise<boolean> {
  const signature = manifest.signature;
  if (!signature || signature.algorithm !== 'ECDSA-P256-SHA256') return false;
  const publicKeyBase64 = TRUSTED_KEYS[signature.keyId];
  if (!publicKeyBase64) return false;

  try {
    const key = await crypto.subtle.importKey(
      'spki',
      base64ToBytes(publicKeyBase64),
      { name: 'ECDSA', namedCurve: 'P-256' },
      false,
      ['verify']
    );
    return await crypto.subtle.verify(
      { name: 'ECDSA', hash: 'SHA-256' },
      key,
      base64ToBytes(signature.signature),
      new TextEncoder().encode(canonicalizeManifest(manifest))
    );
  } catch {
    return false;
  }
}

export function isSignatureShapeValid(signature: unknown): signature is FirmwareSignature {
  if (!signature || typeof signature !== 'object') return false;
  const value = signature as Record<string, unknown>;
  return value.algorithm === 'ECDSA-P256-SHA256'
    && typeof value.keyId === 'string'
    && /^[A-Za-z0-9+/]+={0,2}$/.test(String(value.signature || ''));
}
