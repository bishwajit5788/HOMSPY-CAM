import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { verifyManifestSignature, canonicalizeManifest } from '../src/services/firmware/firmwareTrust';
import { firmwareRollbackService } from '../src/services/firmware/firmwareRollbackService';
import { flashRecoveryService } from '../src/services/recovery/flashRecoveryService';
import type { FirmwareManifest, FirmwarePackage } from '../src/types/firmware';

const signedManifest: FirmwareManifest = {
  name: 'XIAO ESP32S3 Camera', version: '1.0.0', chip: 'ESP32-S3', board: 'Seeed Studio XIAO ESP32S3 Sense',
  description: 'Stage 1 Camera and MicroSD diagnostics firmware for Seeed Studio XIAO ESP32S3 Sense.', flash_size: '8MB', flash_mode: 'dio', flash_freq: '80m',
  files: [
    { path: 'bootloader.bin', offset: '0x0', size: 4148, sha256: '32e76ea1fc4af8efa70d385097e8900da34be04edd790feaabb4f2612e2c6410', description: 'ESP32-S3 2nd stage ROM bootloader' },
    { path: 'partitions.bin', offset: '0x8000', size: 3072, sha256: '4a9422466b91248595e6bbb0d3ee1729330025533ade771bf52d77620957fd55', description: 'ESP32-S3 partition table' },
    { path: 'firmware.bin', offset: '0x10000', size: 32820, sha256: 'b64ced8dfc22162e4039cf08b327c515e89f013e53e96126ff590e17b4053b80', description: 'XIAO ESP32S3 Sense Stage 1 camera firmware application' },
  ],
  signature: { algorithm: 'ECDSA-P256-SHA256', keyId: 'homspy-release-2026-p256', signature: 'ANoJVYpvMQU1yjQQ52wsx44sibZd0o1i15lUNskwT48hAKC9ClxC9CA50hO8hhAZUjzIx++xcw2Lm1WP9EtMGA==' },
};

const pkg = (version: string, name = 'Test Release'): FirmwarePackage => ({
  name, version, chip: 'ESP32-S3', board: 'Seeed Studio XIAO ESP32S3 Sense', flashMode: 'dio', flashFreq: '80m', flashSize: '8MB', files: [], totalSize: 0, source: 'builtin', trustLevel: 'signed_verified', trustReason: 'test',
});

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
}

describe('release trust and recovery hardening', () => {
  beforeEach(() => { vi.stubGlobal('localStorage', new MemoryStorage()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it('verifies the pinned built-in manifest signature', async () => {
    expect(canonicalizeManifest(signedManifest)).toContain('XIAO ESP32S3 Camera');
    await expect(verifyManifestSignature(signedManifest)).resolves.toBe(true);
  });

  it('rejects a signed manifest after any signed field changes', async () => {
    const tampered = { ...signedManifest, version: '1.0.1' };
    await expect(verifyManifestSignature(tampered)).resolves.toBe(false);
  });

  it('blocks a lower trusted release after a newer trusted release succeeds', () => {
    firmwareRollbackService.recordSuccessfulFlash(pkg('1.2.0'));
    expect(firmwareRollbackService.check(pkg('1.1.9')).allowed).toBe(false);
    expect(firmwareRollbackService.check(pkg('1.2.0')).allowed).toBe(false);
    expect(firmwareRollbackService.check(pkg('1.3.0')).allowed).toBe(true);
  });

  it('retains interrupted flash state and matches the same package fingerprint', () => {
    const release = pkg('1.2.0', 'Recovery Test');
    flashRecoveryService.begin(release, 'writing', { flashMode: 'dio', flashFreq: '80m', flashSize: '8MB', eraseAll: false, compress: false });
    flashRecoveryService.markInterrupted();
    expect(flashRecoveryService.get()?.interrupted).toBe(true);
    expect(flashRecoveryService.matches(release)).toBe(true);
    flashRecoveryService.clear();
    expect(flashRecoveryService.get()).toBeNull();
  });
});
