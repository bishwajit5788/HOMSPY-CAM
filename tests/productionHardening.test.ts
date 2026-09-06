import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { FirmwareValidator } from '../src/services/firmware/firmwareValidator';
import { FlashService } from '../src/services/flashing/flashService';
import { esp32Service } from '../src/services/esp32/esp32Service';
import { portCoordinator } from '../src/services/port/portCoordinator';

function makeImage(chipId = 0x0009, magic = 0xe9, hashAppended = 0): Uint8Array {
  const image = new Uint8Array(64);
  image[0] = magic;
  image[1] = 1;
  image[12] = chipId & 0xff;
  image[13] = (chipId >> 8) & 0xff;
  image[23] = hashAppended;
  return image;
}

describe('Production hardening', () => {
  beforeEach(() => portCoordinator.reset());
  afterEach(() => vi.restoreAllMocks());

  it('never treats a UI-selected flash size as detected hardware capacity', () => {
    expect(FirmwareValidator.parseFlashCapacityBytes('8MB')).toBeNull();
    expect(FirmwareValidator.parseFlashCapacityBytes('detected:8MB')).toBe(8 * 1024 * 1024);
    expect(FirmwareValidator.parseFlashCapacityBytes('detected:16MB')).toBe(16 * 1024 * 1024);
  });

  it('validates the full 16-bit ESP image chip ID', () => {
    const pkg = {
      name: 'test', version: '1', chip: 'ESP32-S3', source: 'custom' as const,
      trustLevel: 'unverified_custom' as const, trustReason: 'test', flashMode: 'dio' as const,
      flashFreq: '80m' as const, flashSize: '8MB' as const, totalSize: 64,
      files: [{ id: '1', fileName: 'app.bin', offsetHex: '0x10000', offsetNum: 0x10000, data: makeImage(0x0109), size: 64, sha256: 'a'.repeat(64), md5: 'b'.repeat(32), isValid: true }],
    };
    const result = FirmwareValidator.validatePackage(pkg, 8 * 1024 * 1024, 'ESP32-S3');
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'files[0].chip_id')).toBe(true);
  });

  it('rejects invalid magic as a hard error', () => {
    const pkg = {
      name: 'test', version: '1', chip: 'ESP32-S3', source: 'custom' as const,
      trustLevel: 'unverified_custom' as const, trustReason: 'test', flashMode: 'dio' as const,
      flashFreq: '80m' as const, flashSize: '8MB' as const, totalSize: 64,
      files: [{ id: '1', fileName: 'app.bin', offsetHex: '0x10000', offsetNum: 0x10000, data: makeImage(0x0009, 0x00), size: 64, sha256: 'a'.repeat(64), md5: 'b'.repeat(32), isValid: true }],
    };
    const result = FirmwareValidator.validatePackage(pkg, 8 * 1024 * 1024, 'ESP32-S3');
    expect(result.isValid).toBe(false);
    expect(result.errors.some((e) => e.field === 'files[0].header')).toBe(true);
  });

  it('discards a stale connection result after physical disconnect invalidates the operation token', async () => {
    let lost: (() => void) | undefined;
    let resolveConnect!: (chip: { chipName: string; macAddress: string; description: string; flashSize: string }) => void;
    const pending = new Promise<{ chipName: string; macAddress: string; description: string; flashSize: string }>((resolve) => { resolveConnect = resolve; });

    vi.spyOn(esp32Service, 'connectAndDetect').mockImplementation(async (_port, _baud, onDeviceLost) => {
      lost = onDeviceLost;
      return pending;
    });

    const flash = new FlashService();
    const connection = flash.connectDevice({} as SerialPort);
    await Promise.resolve();
    expect(lost).toBeTypeOf('function');

    lost?.();
    resolveConnect({ chipName: 'ESP32-S3', macAddress: '00:00:00:00:00:00', description: 'test', flashSize: 'detected:8MB' });

    await expect(connection).rejects.toThrow(/stale|superseded/i);
    expect(flash.state).toBe('ERROR');
    expect(flash.chip).toBeNull();
  });
});
