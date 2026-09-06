import type {
  FirmwarePackage,
  FirmwareManifest,
  ManifestFileEntry,
  FlashCapacityStatus,
} from '../../types/firmware';
import { parseHexAddress } from '../../utils/formatters';

export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

export interface ValidationResult {
  isValid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
  flashCapacityStatus: FlashCapacityStatus;
}

// Standard chip identifiers in ESP-IDF image header (offset 12 in image extended header)
export const ESP_CHIP_IDS: Record<number, string> = {
  0x00: 'ESP32',
  0x02: 'ESP32-S2',
  0x05: 'ESP32-C3',
  0x09: 'ESP32-S3',
  0x0c: 'ESP32-C2',
  0x0d: 'ESP32-C6',
  0x10: 'ESP32-H2',
  0x12: 'ESP32-P4',
};

export class FirmwareValidator {
  /**
   * Validates manifest JSON structure, paths, offsets, and field types.
   */
  public static validateManifestSchema(manifest: unknown): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!manifest || typeof manifest !== 'object') {
      errors.push({
        field: 'manifest',
        message: 'Manifest must be a valid JSON object.',
        severity: 'error',
      });
      return { isValid: false, errors, warnings, flashCapacityStatus: 'unknown' };
    }

    const m = manifest as Partial<FirmwareManifest>;

    if (!m.name || typeof m.name !== 'string' || m.name.trim().length === 0) {
      errors.push({
        field: 'name',
        message: 'Manifest missing required non-empty "name" field.',
        severity: 'error',
      });
    }

    if (!m.version || typeof m.version !== 'string' || m.version.trim().length === 0) {
      warnings.push({
        field: 'version',
        message: 'Manifest missing version string; defaulting to 1.0.0.',
        severity: 'warning',
      });
    }

    if (!m.chip || typeof m.chip !== 'string') {
      errors.push({
        field: 'chip',
        message: 'Manifest missing required "chip" field (expected "ESP32-S3").',
        severity: 'error',
      });
    }

    if (!m.files || !Array.isArray(m.files) || m.files.length === 0) {
      errors.push({
        field: 'files',
        message: 'Manifest must declare a non-empty "files" array.',
        severity: 'error',
      });
      return { isValid: errors.length === 0, errors, warnings, flashCapacityStatus: 'unknown' };
    }

    for (const [idx, fileEntry] of m.files.entries()) {
      this.validateManifestEntry(fileEntry, idx, errors, warnings);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      flashCapacityStatus: 'unknown',
    };
  }

  /**
   * Validates an individual manifest file entry.
   */
  private static validateManifestEntry(
    entry: unknown,
    index: number,
    errors: ValidationError[],
    warnings: ValidationError[]
  ): void {
    if (!entry || typeof entry !== 'object') {
      errors.push({
        field: `files[${index}]`,
        message: `File entry at index ${index} is not an object.`,
        severity: 'error',
      });
      return;
    }

    const f = entry as Partial<ManifestFileEntry>;

    // Path safety validation (Security against traversal)
    if (!f.path || typeof f.path !== 'string') {
      errors.push({
        field: `files[${index}].path`,
        message: `File entry at index ${index} is missing a valid "path" string.`,
        severity: 'error',
      });
    } else {
      if (f.path.includes('..') || f.path.startsWith('/') || f.path.includes('://')) {
        errors.push({
          field: `files[${index}].path`,
          message: `Unsafe path detected in manifest: "${f.path}". Path traversal and external URLs are forbidden.`,
          severity: 'error',
        });
      }
    }

    // Offset validation
    if (f.offset === undefined || f.offset === null) {
      errors.push({
        field: `files[${index}].offset`,
        message: `File entry "${f.path || index}" is missing an "offset" definition.`,
        severity: 'error',
      });
    } else {
      const offsetNum = parseHexAddress(String(f.offset));
      if (isNaN(offsetNum) || offsetNum < 0) {
        errors.push({
          field: `files[${index}].offset`,
          message: `Invalid offset "${f.offset}" in file "${f.path}". Must be a valid non-negative address.`,
          severity: 'error',
        });
      } else if (offsetNum % 4 !== 0) {
        errors.push({
          field: `files[${index}].offset`,
          message: `Offset 0x${offsetNum.toString(16)} for "${f.path}" must be 4-byte aligned (multiple of 4).`,
          severity: 'error',
        });
      }
    }

    // Size / expectedSize normalization & validation
    const declaredSize = f.size ?? f.expectedSize;
    if (declaredSize !== undefined) {
      if (typeof declaredSize !== 'number' || declaredSize <= 0 || !Number.isInteger(declaredSize)) {
        errors.push({
          field: `files[${index}].size`,
          message: `Declared size "${declaredSize}" for "${f.path}" must be a positive integer byte count.`,
          severity: 'error',
        });
      }
    }

    // SHA-256 validation format check if specified
    if (f.sha256) {
      if (!/^[a-fA-F0-9]{64}$/.test(f.sha256)) {
        errors.push({
          field: `files[${index}].sha256`,
          message: `Invalid SHA-256 hash format for "${f.path}". Expected 64 hexadecimal characters.`,
          severity: 'error',
        });
      }
    } else {
      warnings.push({
        field: `files[${index}].sha256`,
        message: `File "${f.path}" does not declare a SHA-256 checksum. Integrity verification will rely on runtime calculation.`,
        severity: 'warning',
      });
    }
  }

  /**
   * Performs deep safety and hardware validation on a populated FirmwarePackage.
   */
  public static validatePackage(
    pkg: FirmwarePackage,
    detectedCapacityBytes?: number | null,
    expectedChip = 'ESP32-S3'
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (!pkg.files || pkg.files.length === 0) {
      errors.push({
        field: 'files',
        message: 'Firmware package contains no binary files.',
        severity: 'error',
      });
      return { isValid: false, errors, warnings, flashCapacityStatus: 'unknown' };
    }

    // 1. Chip compatibility check
    if (pkg.chip && !pkg.chip.toUpperCase().includes(expectedChip.toUpperCase())) {
      warnings.push({
        field: 'chip',
        message: `Package target chip is "${pkg.chip}", but connected hardware profile is "${expectedChip}".`,
        severity: 'warning',
      });
    }

    // 2. Individual file validation & ESP image header inspection
    for (const [idx, bin] of pkg.files.entries()) {
      if (!bin.data || bin.data.byteLength === 0) {
        errors.push({
          field: `files[${idx}].data`,
          message: `File "${bin.fileName}" is empty (0 bytes). Cannot flash empty payload.`,
          severity: 'error',
        });
        continue;
      }

      if (bin.offsetNum < 0) {
        errors.push({
          field: `files[${idx}].offset`,
          message: `Negative offset 0x${bin.offsetNum.toString(16)} for file "${bin.fileName}".`,
          severity: 'error',
        });
      }

      if (bin.offsetNum % 4 !== 0) {
        errors.push({
          field: `files[${idx}].offset`,
          message: `Offset 0x${bin.offsetNum.toString(16)} for file "${bin.fileName}" is not 4-byte aligned.`,
          severity: 'error',
        });
      }

      // Check ESP image header for executable images (bootloader at 0x0 or app at 0x10000)
      if (bin.offsetNum === 0x0 || bin.offsetNum >= 0x10000) {
        if (bin.data.byteLength < 24) {
          errors.push({
            field: `files[${idx}].header`,
            message: `Executable image "${bin.fileName}" at ${bin.offsetHex} is too small (${bin.data.byteLength} bytes). Minimum 24 bytes required for ESP32 image header.`,
            severity: 'error',
          });
        } else {
          // Magic byte check (must be 0xE9)
          const magic = bin.data[0];
          if (magic !== 0xe9) {
            errors.push({
              field: `files[${idx}].header`,
              message: `File "${bin.fileName}" at offset ${bin.offsetHex} is missing mandatory ESP32 image magic byte (0xE9). First byte is 0x${magic.toString(16).toUpperCase().padStart(2, '0')}. Flashing this image will cause immediate ROM boot failure.`,
              severity: 'error',
            });
          }

          // Chip ID check in header byte 12 (ESP-IDF format)
          const chipId = bin.data[12];
          if (expectedChip.toUpperCase().includes('ESP32-S3') && chipId !== 0x09) {
            const detectedName = ESP_CHIP_IDS[chipId] || `Unknown (0x${chipId.toString(16)})`;
            errors.push({
              field: `files[${idx}].chip_id`,
              message: `Chip architecture mismatch: File "${bin.fileName}" header indicates chip ID 0x${chipId.toString(16).padStart(2, '0')} (${detectedName}), but target is ESP32-S3 (0x09). Flashing wrong architecture will cause immediate CPU boot failure.`,
              severity: 'error',
            });
          }

          // Extended header append_digest check (byte 23 must be 0 or 1)
          const appendDigest = bin.data[23];
          if (appendDigest !== 0 && appendDigest !== 1) {
            errors.push({
              field: `files[${idx}].header`,
              message: `Invalid append_digest header field in "${bin.fileName}" (0x${appendDigest.toString(16)}). Must be 0 or 1 per ESP-IDF image specification.`,
              severity: 'error',
            });
          }
        }
      }
    }

    // 3. Address overlap detection
    const sorted = [...pkg.files].sort((a, b) => a.offsetNum - b.offsetNum);
    for (let i = 0; i < sorted.length - 1; i++) {
      const current = sorted[i];
      const next = sorted[i + 1];
      const currentEnd = current.offsetNum + current.size;

      if (currentEnd > next.offsetNum) {
        const overlapBytes = currentEnd - next.offsetNum;
        errors.push({
          field: 'address_overlap',
          message: `Memory overlap detected: "${current.fileName}" (0x${current.offsetNum.toString(16)} - 0x${currentEnd.toString(16)}) overlaps with "${next.fileName}" (0x${next.offsetNum.toString(16)}) by ${overlapBytes} bytes.`,
          severity: 'error',
        });
      }
    }

    // 4. Flash capacity boundary check (No unsafe 8MB fallback)
    let flashCapacityStatus: FlashCapacityStatus = 'verified';
    if (!detectedCapacityBytes || detectedCapacityBytes <= 0) {
      flashCapacityStatus = 'unknown';
      warnings.push({
        field: 'flash_capacity',
        message:
          'Target flash capacity is UNKNOWN. Flash memory boundary safety cannot be verified automatically. Verify flash size before flashing custom payloads.',
        severity: 'warning',
      });
    } else {
      for (const bin of pkg.files) {
        const fileEnd = bin.offsetNum + bin.size;
        if (fileEnd > detectedCapacityBytes) {
          flashCapacityStatus = 'exceeded';
          errors.push({
            field: 'flash_capacity',
            message: `File "${bin.fileName}" extends to 0x${fileEnd.toString(16)} (${fileEnd} bytes), which exceeds detected flash capacity of 0x${detectedCapacityBytes.toString(16)} (${detectedCapacityBytes} bytes).`,
            severity: 'error',
          });
        }
      }
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      flashCapacityStatus,
    };
  }

  /**
   * Parses human-readable flash size strings ("8MB", "4MB", "16MB") into exact byte counts.
   * Returns null if string is undefined, empty, or unparseable.
   * (NO SILENT 8MB FALLBACK)
   */
  public static parseFlashCapacityBytes(flashSizeStr?: string): number | null {
    if (!flashSizeStr) return null;
    const clean = flashSizeStr.toUpperCase().trim();
    if (clean.includes('32MB')) return 32 * 1024 * 1024;
    if (clean.includes('16MB')) return 16 * 1024 * 1024;
    if (clean.includes('8MB')) return 8 * 1024 * 1024;
    if (clean.includes('4MB')) return 4 * 1024 * 1024;
    if (clean.includes('2MB')) return 2 * 1024 * 1024;
    if (clean.includes('1MB')) return 1 * 1024 * 1024;
    if (clean.includes('512KB')) return 512 * 1024;
    if (clean.includes('256KB')) return 256 * 1024;
    return null;
  }
}
