import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
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
  signature: { algorithm: 'ECDSA-P256-SHA256', keyId: 'homspy-release-2026-p256', signature: 'HMM7G/fRIX/NXlUFoUXP25vwRvsKgrb3VMvWkNzjUA1jySDp2JxneRqXDymVAGbiwCsbPlbKLLlzeG4x7hRynw==' },
};

const pkg = (version: string, name = 'Test Release', files: FirmwarePackage['files'] = []): FirmwarePackage => ({
  name, version, chip: 'ESP32-S3', board: 'Seeed Studio XIAO ESP32S3 Sense',
  flashMode: 'dio', flashFreq: '80m', flashSize: '8MB', files, totalSize: 0,
  source: 'builtin', trustLevel: 'signed_verified', trustReason: 'test',
});

const customPkg = (version: string, name = 'Custom Release'): FirmwarePackage => ({
  name, version, chip: 'ESP32-S3', board: 'Seeed Studio XIAO ESP32S3 Sense',
  flashMode: 'dio', flashFreq: '80m', flashSize: '8MB', files: [], totalSize: 0,
  source: 'custom', trustLevel: 'unverified_custom', trustReason: 'custom upload',
});

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) { return this.values.get(key) ?? null; }
  setItem(key: string, value: string) { this.values.set(key, value); }
  removeItem(key: string) { this.values.delete(key); }
  clear() { this.values.clear(); }
}

describe('release trust and recovery hardening', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', new MemoryStorage());
    firmwareRollbackService.clearForDevelopment();
  });
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
    // Lower version must be BLOCKED
    expect(firmwareRollbackService.check(pkg('1.1.9')).allowed).toBe(false);
    expect(firmwareRollbackService.check(pkg('1.1.0')).allowed).toBe(false);
    // Same version with same fingerprint must be ALLOWED (repair/re-flash)
    expect(firmwareRollbackService.check(pkg('1.2.0')).allowed).toBe(true);
    // Same version with different fingerprint must be BLOCKED
    const tamperedPkg = {
      ...pkg('1.2.0'),
      files: [{
        id: '1', fileName: 'tampered.bin', offsetHex: '0x10000', offsetNum: 0x10000,
        data: new Uint8Array(64), size: 64, sha256: 'a'.repeat(64), md5: 'b'.repeat(32), isValid: true,
      }],
    };
    expect(firmwareRollbackService.check(tamperedPkg).allowed).toBe(false);
    // Higher version must be ALLOWED
    expect(firmwareRollbackService.check(pkg('1.3.0')).allowed).toBe(true);
  });

  it('allows unverified custom firmware without rollback policy restrictions', () => {
    firmwareRollbackService.recordSuccessfulFlash(pkg('1.2.0'));
    // Custom unverified firmware can be flashed at any version
    expect(firmwareRollbackService.check(customPkg('1.0.0')).allowed).toBe(true);
    expect(firmwareRollbackService.check(customPkg('custom-build-dev')).allowed).toBe(true);

    // Recording custom firmware flash must not overwrite or corrupt the trusted baseline
    firmwareRollbackService.recordSuccessfulFlash(customPkg('0.5.0'));
    expect(firmwareRollbackService.get()?.version).toBe('1.2.0');
  });

  it('blocks trusted firmware releases with malformed or empty version strings', () => {
    firmwareRollbackService.recordSuccessfulFlash(pkg('1.2.0'));
    expect(firmwareRollbackService.check(pkg('')).allowed).toBe(false);
    expect(firmwareRollbackService.check(pkg('invalid-semver')).allowed).toBe(false);
    expect(firmwareRollbackService.check(pkg('1.x.y')).allowed).toBe(false);
  });

  it('allows flashing when no previous release record exists in localStorage', () => {
    expect(firmwareRollbackService.get()).toBeNull();
    expect(firmwareRollbackService.check(pkg('1.0.0')).allowed).toBe(true);
  });

  it('safely handles corrupted or invalid localStorage entries', () => {
    localStorage.setItem('homspy-cam.firmware-release.v1', '{corrupt-json');
    expect(firmwareRollbackService.get()).toBeNull();
    expect(firmwareRollbackService.check(pkg('1.0.0')).allowed).toBe(true);

    localStorage.setItem('homspy-cam.firmware-release.v1', JSON.stringify({ version: 'invalid-semver', packageKey: 'key' }));
    expect(firmwareRollbackService.get()).toBeNull();
    expect(firmwareRollbackService.check(pkg('1.0.0')).allowed).toBe(true);
  });

  it('preserves the highest recorded trusted baseline and refuses to downgrade baseline', () => {
    firmwareRollbackService.recordSuccessfulFlash(pkg('1.3.0'));
    expect(firmwareRollbackService.get()?.version).toBe('1.3.0');

    // Attempting to record a lower version (e.g. 1.2.0) must not downgrade baseline
    firmwareRollbackService.recordSuccessfulFlash(pkg('1.2.0'));
    expect(firmwareRollbackService.get()?.version).toBe('1.3.0');

    // Attempting to record a malformed version must not touch baseline
    firmwareRollbackService.recordSuccessfulFlash(pkg('bad-version'));
    expect(firmwareRollbackService.get()?.version).toBe('1.3.0');

    // Now 1.2.0 is still blocked
    expect(firmwareRollbackService.check(pkg('1.2.0')).allowed).toBe(false);
    // 1.4.0 is allowed and can advance the baseline
    expect(firmwareRollbackService.check(pkg('1.4.0')).allowed).toBe(true);
    firmwareRollbackService.recordSuccessfulFlash(pkg('1.4.0'));
    expect(firmwareRollbackService.get()?.version).toBe('1.4.0');
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
