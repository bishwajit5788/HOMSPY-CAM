import { describe, it, expect } from 'vitest';
import { FirmwareValidator } from '../src/services/firmware/firmwareValidator';
import type { FirmwarePackage, FirmwareManifest } from '../src/types/firmware';

describe('FirmwareValidator', () => {
  describe('validateManifestSchema', () => {
    it('passes for a valid manifest schema', () => {
      const validManifest: FirmwareManifest = {
        name: 'Stage 1 Camera',
        version: '1.0.0',
        chip: 'ESP32-S3',
        description: 'Camera firmware',
        files: [
          {
            path: 'bootloader.bin',
            offset: '0x0',
            sha256: 'a'.repeat(64),
            size: 16384,
          },
          {
            path: 'partitions.bin',
            offset: '0x8000',
            sha256: 'b'.repeat(64),
            size: 3072,
          },
          {
            path: 'firmware.bin',
            offset: '0x10000',
            sha256: 'c'.repeat(64),
            size: 524288,
          },
        ],
      };

      const result = FirmwareValidator.validateManifestSchema(validManifest);
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });

    it('rejects non-object or null manifests', () => {
      expect(FirmwareValidator.validateManifestSchema(null).isValid).toBe(false);
      expect(FirmwareValidator.validateManifestSchema('string').isValid).toBe(false);
      expect(FirmwareValidator.validateManifestSchema(123).isValid).toBe(false);
    });

    it('rejects manifest with missing name or chip', () => {
      const missingName = {
        version: '1.0.0',
        chip: 'ESP32-S3',
        files: [{ path: 'app.bin', offset: '0x10000' }],
      };
      const res1 = FirmwareValidator.validateManifestSchema(missingName);
      expect(res1.isValid).toBe(false);
      expect(res1.errors.some((e) => e.field === 'name')).toBe(true);

      const missingChip = {
        name: 'Test App',
        version: '1.0.0',
        files: [{ path: 'app.bin', offset: '0x10000' }],
      };
      const res2 = FirmwareValidator.validateManifestSchema(missingChip);
      expect(res2.isValid).toBe(false);
      expect(res2.errors.some((e) => e.field === 'chip')).toBe(true);
    });

    it('rejects empty files array', () => {
      const emptyFiles = {
        name: 'Test',
        version: '1.0.0',
        chip: 'ESP32-S3',
        files: [],
      };
      const res = FirmwareValidator.validateManifestSchema(emptyFiles);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.field === 'files')).toBe(true);
    });

    it('prevents path traversal and URL injection in file paths', () => {
      const unsafeManifest = {
        name: 'Malicious Manifest',
        version: '1.0.0',
        chip: 'ESP32-S3',
        files: [
          { path: '../../etc/passwd', offset: '0x0' },
          { path: '/root/private.key', offset: '0x8000' },
          { path: 'https://attacker.com/payload.bin', offset: '0x10000' },
        ],
      };
      const res = FirmwareValidator.validateManifestSchema(unsafeManifest);
      expect(res.isValid).toBe(false);
      expect(res.errors).toHaveLength(3);
      expect(res.errors[0].message).toContain('Unsafe path detected');
      expect(res.errors[1].message).toContain('Unsafe path detected');
      expect(res.errors[2].message).toContain('Unsafe path detected');
    });

    it('rejects unaligned flash offset in manifest', () => {
      const unaligned = {
        name: 'Unaligned Offset',
        version: '1.0.0',
        chip: 'ESP32-S3',
        files: [{ path: 'firmware.bin', offset: '0x10001' }],
      };
      const res = FirmwareValidator.validateManifestSchema(unaligned);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.message.includes('4-byte aligned'))).toBe(true);
    });

    it('validates SHA-256 format if provided', () => {
      const invalidSha = {
        name: 'Invalid SHA',
        version: '1.0.0',
        chip: 'ESP32-S3',
        files: [{ path: 'firmware.bin', offset: '0x10000', sha256: 'tooshort' }],
      };
      const res = FirmwareValidator.validateManifestSchema(invalidSha);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.field === 'files[0].sha256')).toBe(true);
    });
  });

  describe('validatePackage', () => {
    // Helper to generate a valid ESP32-S3 image header
    const makeEspImage = (magic = 0xe9, chipId = 0x0009, size = 64): Uint8Array => {
      const arr = new Uint8Array(Math.max(size, 24));
      arr[0] = magic;
      arr[12] = chipId & 0xff;
      arr[13] = (chipId >> 8) & 0xff;
      return arr;
    };

    it('passes for a valid package matching hardware profile', () => {
      const pkg: FirmwarePackage = {
        name: 'Valid XIAO Package',
        version: '1.0.0',
        chip: 'ESP32-S3',
        totalSize: 4096 + 3072 + 65536,
        files: [
          {
            fileName: 'bootloader.bin',
            offsetHex: '0x0',
            offsetNum: 0x0,
            data: makeEspImage(0xe9, 0x0009, 4096),
            size: 4096,
          },
          {
            fileName: 'partitions.bin',
            offsetHex: '0x8000',
            offsetNum: 0x8000,
            data: new Uint8Array(3072),
            size: 3072,
          },
          {
            fileName: 'firmware.bin',
            offsetHex: '0x10000',
            offsetNum: 0x10000,
            data: makeEspImage(0xe9, 0x0009, 65536),
            size: 65536,
          },
        ],
      };

      const result = FirmwareValidator.validatePackage(pkg, 8 * 1024 * 1024, 'ESP32-S3');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
    });

    it('rejects empty package files', () => {
      const emptyPkg: FirmwarePackage = {
        name: 'Empty Package',
        version: '1.0.0',
        chip: 'ESP32-S3',
        totalSize: 0,
        files: [],
      };
      const res = FirmwareValidator.validatePackage(emptyPkg);
      expect(res.isValid).toBe(false);
      expect(res.errors[0].field).toBe('files');
    });

    it('rejects files with 0 byte length', () => {
      const pkgWithZeroBytes: FirmwarePackage = {
        name: 'Zero Byte File',
        version: '1.0.0',
        chip: 'ESP32-S3',
        totalSize: 0,
        files: [
          {
            fileName: 'empty.bin',
            offsetHex: '0x0',
            offsetNum: 0x0,
            data: new Uint8Array(0),
            size: 0,
          },
        ],
      };
      const res = FirmwareValidator.validatePackage(pkgWithZeroBytes);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.message.includes('empty (0 bytes)'))).toBe(true);
    });

    it('detects unaligned binary offsets', () => {
      const pkg: FirmwarePackage = {
        name: 'Unaligned',
        version: '1.0.0',
        chip: 'ESP32-S3',
        totalSize: 100,
        files: [
          {
            fileName: 'bad_offset.bin',
            offsetHex: '0x1002',
            offsetNum: 0x1002,
            data: new Uint8Array(100),
            size: 100,
          },
        ],
      };
      const res = FirmwareValidator.validatePackage(pkg);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.message.includes('not 4-byte aligned'))).toBe(true);
    });

    it('detects memory address overlaps between segments', () => {
      const pkg: FirmwarePackage = {
        name: 'Overlapping Package',
        version: '1.0.0',
        chip: 'ESP32-S3',
        totalSize: 2048,
        files: [
          {
            fileName: 'first.bin',
            offsetHex: '0x8000',
            offsetNum: 0x8000,
            data: new Uint8Array(0x1000), // extends from 0x8000 to 0x9000
            size: 0x1000,
          },
          {
            fileName: 'second.bin',
            offsetHex: '0x8800', // starts inside first.bin (0x8800 < 0x9000)
            offsetNum: 0x8800,
            data: new Uint8Array(0x1000),
            size: 0x1000,
          },
        ],
      };
      const res = FirmwareValidator.validatePackage(pkg);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.field === 'address_overlap')).toBe(true);
      expect(res.errors[0].message).toContain('overlaps with "second.bin"');
      expect(res.errors[0].message).toContain('2048 bytes');
    });

    it('rejects binary files exceeding flash memory capacity', () => {
      const flashCapacity = 4 * 1024 * 1024; // 4MB
      const pkg: FirmwarePackage = {
        name: 'Oversized Package',
        version: '1.0.0',
        chip: 'ESP32-S3',
        totalSize: 1024,
        files: [
          {
            fileName: 'huge.bin',
            offsetHex: '0x3FFF00',
            offsetNum: 0x3fff00,
            data: new Uint8Array(0x2000), // extends past 0x400000 (4MB)
            size: 0x2000,
          },
        ],
      };
      const res = FirmwareValidator.validatePackage(pkg, flashCapacity);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.field === 'flash_capacity')).toBe(true);
      expect(res.errors[0].message).toContain('exceeds detected flash capacity');
    });

    it('issues warnings for invalid ESP32 magic byte or wrong chip_id in header', () => {
      const pkg: FirmwarePackage = {
        name: 'Wrong Chip Header',
        version: '1.0.0',
        chip: 'ESP32-S3',
        totalSize: 64,
        files: [
          {
            fileName: 'bootloader.bin',
            offsetHex: '0x0',
            offsetNum: 0x0,
            data: makeEspImage(0xaa, 0x0005, 64), // Magic 0xAA (expected 0xE9), Chip 0x0005 (ESP32-C3)
            size: 64,
          },
        ],
      };
      const res = FirmwareValidator.validatePackage(pkg, 8 * 1024 * 1024, 'ESP32-S3');
      expect(res.isValid).toBe(true); // Warnings do not invalidate package
      expect(res.warnings.some((w) => w.field.includes('header'))).toBe(true);
    });
  });

  describe('parseFlashCapacityBytes', () => {
    it('correctly maps flash capacity strings to byte quantities', () => {
      expect(FirmwareValidator.parseFlashCapacityBytes('4MB')).toBe(4 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('8MB')).toBe(8 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('16MB')).toBe(16 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('32MB')).toBe(32 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('2MB')).toBe(2 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('1MB')).toBe(1 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes(undefined)).toBe(8 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('unknown')).toBe(8 * 1024 * 1024);
    });
  });
});
