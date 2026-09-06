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

    it('validates declared size / expectedSize in manifest', () => {
      const invalidSize = {
        name: 'Invalid Size',
        version: '1.0.0',
        chip: 'ESP32-S3',
        files: [{ path: 'firmware.bin', offset: '0x10000', size: -50 }],
      };
      const res = FirmwareValidator.validateManifestSchema(invalidSize);
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.field === 'files[0].size')).toBe(true);
    });
  });

  describe('validatePackage', () => {
    // Helper to generate a valid ESP32-S3 image header per ESP-IDF specification
    const makeEspImage = (magic = 0xe9, chipId = 0x09, size = 64, appendDigest = 0): Uint8Array => {
      const arr = new Uint8Array(Math.max(size, 24));
      arr[0] = magic; // Byte 0: Magic byte 0xE9
      arr[12] = chipId; // Byte 12: Chip ID (0x09 for ESP32-S3)
      arr[23] = appendDigest; // Byte 23: append_digest flag (0 or 1)
      return arr;
    };

    it('passes for a valid package matching hardware profile', () => {
      const pkg: FirmwarePackage = {
        name: 'Valid XIAO Package',
        version: '1.0.0',
        chip: 'ESP32-S3',
        source: 'builtin',
        trustLevel: 'official_verified',
        trustReason: 'Official test package',
        flashMode: 'dio',
        flashFreq: '80m',
        flashSize: '8MB',
        totalSize: 4096 + 3072 + 65536,
        files: [
          {
            id: '1',
            fileName: 'bootloader.bin',
            offsetHex: '0x0',
            offsetNum: 0x0,
            data: makeEspImage(0xe9, 0x09, 4096),
            size: 4096,
            sha256: 'a'.repeat(64),
            md5: '0'.repeat(32),
            isValid: true,
          },
          {
            id: '2',
            fileName: 'partitions.bin',
            offsetHex: '0x8000',
            offsetNum: 0x8000,
            data: new Uint8Array(3072),
            size: 3072,
            sha256: 'b'.repeat(64),
            md5: '1'.repeat(32),
            isValid: true,
          },
          {
            id: '3',
            fileName: 'firmware.bin',
            offsetHex: '0x10000',
            offsetNum: 0x10000,
            data: makeEspImage(0xe9, 0x09, 65536),
            size: 65536,
            sha256: 'c'.repeat(64),
            md5: '2'.repeat(32),
            isValid: true,
          },
        ],
      };

      const result = FirmwareValidator.validatePackage(pkg, 8 * 1024 * 1024, 'ESP32-S3');
      expect(result.isValid).toBe(true);
      expect(result.errors).toHaveLength(0);
      expect(result.warnings).toHaveLength(0);
      expect(result.flashCapacityStatus).toBe('verified');
    });

    it('treats unknown flash capacity as explicit safe state with warning', () => {
      const pkg: FirmwarePackage = {
        name: 'Package Without Known Flash',
        version: '1.0.0',
        chip: 'ESP32-S3',
        source: 'custom',
        trustLevel: 'unverified_custom',
        trustReason: 'Custom upload',
        flashMode: 'dio',
        flashFreq: '80m',
        flashSize: '8MB',
        totalSize: 4096,
        files: [
          {
            id: '1',
            fileName: 'bootloader.bin',
            offsetHex: '0x0',
            offsetNum: 0x0,
            data: makeEspImage(0xe9, 0x09, 4096),
            size: 4096,
            sha256: 'a'.repeat(64),
            md5: '0'.repeat(32),
            isValid: true,
          },
        ],
      };

      // detectedCapacityBytes is null/undefined
      const res = FirmwareValidator.validatePackage(pkg, null, 'ESP32-S3');
      expect(res.isValid).toBe(true);
      expect(res.flashCapacityStatus).toBe('unknown');
      expect(res.warnings.some((w) => w.field === 'flash_capacity')).toBe(true);
    });

    it('rejects empty package files', () => {
      const emptyPkg: FirmwarePackage = {
        name: 'Empty Package',
        version: '1.0.0',
        chip: 'ESP32-S3',
        source: 'custom',
        trustLevel: 'unverified_custom',
        trustReason: 'Empty',
        flashMode: 'dio',
        flashFreq: '80m',
        flashSize: '8MB',
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
        source: 'custom',
        trustLevel: 'unverified_custom',
        trustReason: 'Zero',
        flashMode: 'dio',
        flashFreq: '80m',
        flashSize: '8MB',
        totalSize: 0,
        files: [
          {
            id: '1',
            fileName: 'empty.bin',
            offsetHex: '0x0',
            offsetNum: 0x0,
            data: new Uint8Array(0),
            size: 0,
            sha256: '',
            md5: '',
            isValid: false,
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
        source: 'custom',
        trustLevel: 'unverified_custom',
        trustReason: 'Unaligned',
        flashMode: 'dio',
        flashFreq: '80m',
        flashSize: '8MB',
        totalSize: 100,
        files: [
          {
            id: '1',
            fileName: 'bad_offset.bin',
            offsetHex: '0x1002',
            offsetNum: 0x1002,
            data: new Uint8Array(100),
            size: 100,
            sha256: '',
            md5: '',
            isValid: true,
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
        source: 'custom',
        trustLevel: 'unverified_custom',
        trustReason: 'Overlap',
        flashMode: 'dio',
        flashFreq: '80m',
        flashSize: '8MB',
        totalSize: 2048,
        files: [
          {
            id: '1',
            fileName: 'first.bin',
            offsetHex: '0x8000',
            offsetNum: 0x8000,
            data: new Uint8Array(0x1000), // extends 0x8000 to 0x9000
            size: 0x1000,
            sha256: '',
            md5: '',
            isValid: true,
          },
          {
            id: '2',
            fileName: 'second.bin',
            offsetHex: '0x8800', // starts at 0x8800 (< 0x9000)
            offsetNum: 0x8800,
            data: new Uint8Array(0x1000),
            size: 0x1000,
            sha256: '',
            md5: '',
            isValid: true,
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
        source: 'custom',
        trustLevel: 'unverified_custom',
        trustReason: 'Oversized',
        flashMode: 'dio',
        flashFreq: '80m',
        flashSize: '4MB',
        totalSize: 1024,
        files: [
          {
            id: '1',
            fileName: 'huge.bin',
            offsetHex: '0x3FFF00',
            offsetNum: 0x3fff00,
            data: new Uint8Array(0x2000), // extends past 0x400000
            size: 0x2000,
            sha256: '',
            md5: '',
            isValid: true,
          },
        ],
      };
      const res = FirmwareValidator.validatePackage(pkg, flashCapacity);
      expect(res.isValid).toBe(false);
      expect(res.flashCapacityStatus).toBe('exceeded');
      expect(res.errors.some((e) => e.field === 'flash_capacity')).toBe(true);
    });

    it('HARD ERRORS on invalid ESP32 magic byte (not a warning)', () => {
      const pkg: FirmwarePackage = {
        name: 'Invalid Magic Byte',
        version: '1.0.0',
        chip: 'ESP32-S3',
        source: 'custom',
        trustLevel: 'unverified_custom',
        trustReason: 'Corrupt magic',
        flashMode: 'dio',
        flashFreq: '80m',
        flashSize: '8MB',
        totalSize: 64,
        files: [
          {
            id: '1',
            fileName: 'bootloader.bin',
            offsetHex: '0x0',
            offsetNum: 0x0,
            data: makeEspImage(0xaa, 0x09, 64), // Magic 0xAA (expected 0xE9)
            size: 64,
            sha256: '',
            md5: '',
            isValid: true,
          },
        ],
      };
      const res = FirmwareValidator.validatePackage(pkg, 8 * 1024 * 1024, 'ESP32-S3');
      expect(res.isValid).toBe(false); // MUST BE HARD ERROR
      expect(res.errors.some((e) => e.message.includes('missing mandatory ESP32 image magic byte'))).toBe(true);
    });

    it('HARD ERRORS on mismatched chip_id in executable header (not a warning)', () => {
      const pkg: FirmwarePackage = {
        name: 'Wrong Chip ID',
        version: '1.0.0',
        chip: 'ESP32-S3',
        source: 'custom',
        trustLevel: 'unverified_custom',
        trustReason: 'Wrong architecture',
        flashMode: 'dio',
        flashFreq: '80m',
        flashSize: '8MB',
        totalSize: 64,
        files: [
          {
            id: '1',
            fileName: 'app.bin',
            offsetHex: '0x10000',
            offsetNum: 0x10000,
            data: makeEspImage(0xe9, 0x05, 64), // Chip 0x05 (ESP32-C3) instead of 0x09 (ESP32-S3)
            size: 64,
            sha256: '',
            md5: '',
            isValid: true,
          },
        ],
      };
      const res = FirmwareValidator.validatePackage(pkg, 8 * 1024 * 1024, 'ESP32-S3');
      expect(res.isValid).toBe(false); // MUST BE HARD ERROR
      expect(res.errors.some((e) => e.message.includes('Chip architecture mismatch'))).toBe(true);
    });

    it('HARD ERRORS on invalid append_digest field in header', () => {
      const pkg: FirmwarePackage = {
        name: 'Bad Append Digest',
        version: '1.0.0',
        chip: 'ESP32-S3',
        source: 'custom',
        trustLevel: 'unverified_custom',
        trustReason: 'Corrupt header',
        flashMode: 'dio',
        flashFreq: '80m',
        flashSize: '8MB',
        totalSize: 64,
        files: [
          {
            id: '1',
            fileName: 'bootloader.bin',
            offsetHex: '0x0',
            offsetNum: 0x0,
            data: makeEspImage(0xe9, 0x09, 64, 0xff), // appendDigest = 0xFF (invalid, must be 0 or 1)
            size: 64,
            sha256: '',
            md5: '',
            isValid: true,
          },
        ],
      };
      const res = FirmwareValidator.validatePackage(pkg, 8 * 1024 * 1024, 'ESP32-S3');
      expect(res.isValid).toBe(false);
      expect(res.errors.some((e) => e.message.includes('Invalid append_digest header field'))).toBe(true);
    });
  });

  describe('parseFlashCapacityBytes', () => {
    it('correctly maps known physically detected flash capacity strings to byte quantities', () => {
      expect(FirmwareValidator.parseFlashCapacityBytes('detected:4MB')).toBe(4 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('detected:8MB')).toBe(8 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('detected:16MB')).toBe(16 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('detected:32MB')).toBe(32 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('detected:2MB')).toBe(2 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('detected:1MB')).toBe(1 * 1024 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('detected:512KB')).toBe(512 * 1024);
      expect(FirmwareValidator.parseFlashCapacityBytes('detected:256KB')).toBe(256 * 1024);
    });

    it('rejects UI-configured or un-prefixed flash capacity strings (returns null to prevent spoofing)', () => {
      expect(FirmwareValidator.parseFlashCapacityBytes('4MB')).toBeNull();
      expect(FirmwareValidator.parseFlashCapacityBytes('8MB')).toBeNull();
      expect(FirmwareValidator.parseFlashCapacityBytes('16MB')).toBeNull();
      expect(FirmwareValidator.parseFlashCapacityBytes('32MB')).toBeNull();
      expect(FirmwareValidator.parseFlashCapacityBytes('configured:8MB')).toBeNull();
    });

    it('returns null for undefined, empty, or unknown strings (NO 8MB fallback)', () => {
      expect(FirmwareValidator.parseFlashCapacityBytes(undefined)).toBeNull();
      expect(FirmwareValidator.parseFlashCapacityBytes('')).toBeNull();
      expect(FirmwareValidator.parseFlashCapacityBytes('   ')).toBeNull();
      expect(FirmwareValidator.parseFlashCapacityBytes('unknown')).toBeNull();
      expect(FirmwareValidator.parseFlashCapacityBytes('INVALID_SIZE')).toBeNull();
    });
  });
});
