import type { FirmwarePackage, FirmwareManifest, ManifestFileEntry, FlashCapacityStatus } from '../../types/firmware';
import { parseHexAddress } from '../../utils/formatters';

export interface ValidationError { field: string; message: string; severity: 'error' | 'warning'; }
export interface ValidationResult { isValid: boolean; errors: ValidationError[]; warnings: ValidationError[]; flashCapacityStatus: FlashCapacityStatus; }
export const ESP_CHIP_IDS: Record<number, string> = { 0x00: 'ESP32', 0x02: 'ESP32-S2', 0x05: 'ESP32-C3', 0x09: 'ESP32-S3', 0x0c: 'ESP32-C2', 0x0d: 'ESP32-C6', 0x10: 'ESP32-H2', 0x12: 'ESP32-P4' };
const ESP_IMAGE_MAGIC = 0xe9; const ESP_IMAGE_HEADER_SIZE = 24; const ESP32_S3_CHIP_ID = 0x0009;

export class FirmwareValidator {
  public static validateManifestSchema(manifest: unknown): ValidationResult {
    const errors: ValidationError[] = [], warnings: ValidationError[] = [];
    if (!manifest || typeof manifest !== 'object') { errors.push({ field: 'manifest', message: 'Manifest must be a valid JSON object.', severity: 'error' }); return { isValid: false, errors, warnings, flashCapacityStatus: 'unknown' }; }
    const m = manifest as Partial<FirmwareManifest>;
    if (!m.name || typeof m.name !== 'string' || !m.name.trim()) errors.push({ field: 'name', message: 'Manifest missing required non-empty "name" field.', severity: 'error' });
    if (!m.version || typeof m.version !== 'string' || !m.version.trim()) warnings.push({ field: 'version', message: 'Manifest missing version string; defaulting to 1.0.0.', severity: 'warning' });
    if (!m.chip || typeof m.chip !== 'string') errors.push({ field: 'chip', message: 'Manifest missing required "chip" field.', severity: 'error' });
    if (!m.files || !Array.isArray(m.files) || m.files.length === 0) { errors.push({ field: 'files', message: 'Manifest must declare a non-empty "files" array.', severity: 'error' }); return { isValid: false, errors, warnings, flashCapacityStatus: 'unknown' }; }
    for (const [idx, entry] of m.files.entries()) this.validateManifestEntry(entry, idx, errors, warnings);
    return { isValid: errors.length === 0, errors, warnings, flashCapacityStatus: 'unknown' };
  }
  private static validateManifestEntry(entry: unknown, index: number, errors: ValidationError[], warnings: ValidationError[]): void {
    if (!entry || typeof entry !== 'object') { errors.push({ field: `files[${index}]`, message: `File entry at index ${index} is not an object.`, severity: 'error' }); return; }
    const f = entry as Partial<ManifestFileEntry>;
    if (!f.path || typeof f.path !== 'string') errors.push({ field: `files[${index}].path`, message: 'File entry is missing a valid path string.', severity: 'error' }); else if (f.path.includes('..') || f.path.startsWith('/') || f.path.includes('://')) errors.push({ field: `files[${index}].path`, message: `Unsafe path detected in manifest: "${f.path}".`, severity: 'error' });
    if (f.offset === undefined || f.offset === null) errors.push({ field: `files[${index}].offset`, message: 'File entry is missing an offset definition.', severity: 'error' }); else { const offsetNum = parseHexAddress(String(f.offset)); if (!Number.isSafeInteger(offsetNum) || offsetNum < 0) errors.push({ field: `files[${index}].offset`, message: `Invalid offset "${f.offset}".`, severity: 'error' }); else if (offsetNum % 4 !== 0) errors.push({ field: `files[${index}].offset`, message: `Offset 0x${offsetNum.toString(16)} must be 4-byte aligned.`, severity: 'error' }); }
    const declaredSize = f.size ?? f.expectedSize; if (declaredSize !== undefined && (typeof declaredSize !== 'number' || !Number.isSafeInteger(declaredSize) || declaredSize <= 0)) errors.push({ field: `files[${index}].size`, message: 'Declared size must be a positive safe integer byte count.', severity: 'error' });
    if (f.sha256 !== undefined) { if (!/^[a-fA-F0-9]{64}$/.test(f.sha256)) errors.push({ field: `files[${index}].sha256`, message: 'Invalid SHA-256 hash format.', severity: 'error' }); } else warnings.push({ field: `files[${index}].sha256`, message: `File "${f.path}" does not declare a SHA-256 checksum.`, severity: 'warning' });
  }
  public static validatePackage(pkg: FirmwarePackage, detectedCapacityBytes?: number | null, expectedChip = 'ESP32-S3'): ValidationResult {
    const errors: ValidationError[] = [], warnings: ValidationError[] = [];
    if (!pkg.files?.length) { errors.push({ field: 'files', message: 'Firmware package contains no binary files.', severity: 'error' }); return { isValid: false, errors, warnings, flashCapacityStatus: 'unknown' }; }
    if (pkg.chip && !pkg.chip.toUpperCase().includes(expectedChip.toUpperCase())) errors.push({ field: 'chip', message: `Package target chip is "${pkg.chip}", but target hardware is "${expectedChip}".`, severity: 'error' });
    for (const [idx, bin] of pkg.files.entries()) {
      if (!bin.data || bin.data.byteLength === 0) { errors.push({ field: `files[${idx}].data`, message: `File "${bin.fileName}" is empty (0 bytes).`, severity: 'error' }); continue; }
      if (bin.size !== bin.data.byteLength) errors.push({ field: `files[${idx}].size`, message: `File "${bin.fileName}" size metadata does not match its data length.`, severity: 'error' });
      if (!Number.isSafeInteger(bin.offsetNum) || bin.offsetNum < 0) errors.push({ field: `files[${idx}].offset`, message: `Invalid offset for "${bin.fileName}".`, severity: 'error' }); else if (bin.offsetNum % 4 !== 0) errors.push({ field: `files[${idx}].offset`, message: `Offset ${bin.offsetHex} for "${bin.fileName}" is not 4-byte aligned.`, severity: 'error' });
      if (bin.offsetNum === 0 || bin.offsetNum >= 0x10000) {
        if (bin.data.byteLength < ESP_IMAGE_HEADER_SIZE) errors.push({ field: `files[${idx}].header`, message: `Executable image "${bin.fileName}" is too small; minimum 24 bytes required.`, severity: 'error' });
        else {
          if (bin.data[0] !== ESP_IMAGE_MAGIC) errors.push({ field: `files[${idx}].header`, message: `Invalid ESP image magic in "${bin.fileName}"; missing mandatory ESP image magic byte; expected 0xE9.`, severity: 'error' });
          const chipId = bin.data[12] | (bin.data[13] << 8);
          if (expectedChip.toUpperCase().includes('ESP32-S3') && chipId !== ESP32_S3_CHIP_ID) { const detectedName = ESP_CHIP_IDS[chipId] || `Unknown (0x${chipId.toString(16).padStart(4, '0')})`; errors.push({ field: `files[${idx}].chip_id`, message: `Chip architecture mismatch in "${bin.fileName}"; header chip ID is 0x${chipId.toString(16).padStart(4, '0')} (${detectedName}), expected ESP32-S3 (0x0009).`, severity: 'error' }); }
          if (bin.data[23] !== 0 && bin.data[23] !== 1) errors.push({ field: `files[${idx}].header`, message: `Invalid append_digest/hash_appended field in "${bin.fileName}"; expected 0 or 1.`, severity: 'error' });
        }
      }
    }
    const sorted = [...pkg.files].sort((a, b) => a.offsetNum - b.offsetNum);
    for (let i = 0; i < sorted.length - 1; i++) { const end = sorted[i].offsetNum + sorted[i].size; if (!Number.isSafeInteger(end) || end < sorted[i].offsetNum) errors.push({ field: 'address_overflow', message: `Address range overflow detected for "${sorted[i].fileName}".`, severity: 'error' }); else if (end > sorted[i + 1].offsetNum) errors.push({ field: 'address_overlap', message: `Memory range "${sorted[i].fileName}" overlaps with "${sorted[i + 1].fileName}".`, severity: 'error' }); }
    let flashCapacityStatus: FlashCapacityStatus = 'verified';
    if (!detectedCapacityBytes || detectedCapacityBytes <= 0) { flashCapacityStatus = 'unknown'; warnings.push({ field: 'flash_capacity', message: 'Target flash capacity is UNKNOWN. Flash boundary safety cannot be verified automatically.', severity: 'warning' }); } else if (!Number.isSafeInteger(detectedCapacityBytes)) { flashCapacityStatus = 'unknown'; errors.push({ field: 'flash_capacity', message: 'Detected flash capacity is not a safe integer.', severity: 'error' }); } else { for (const bin of pkg.files) { const end = bin.offsetNum + bin.size; if (!Number.isSafeInteger(end) || end < bin.offsetNum) { flashCapacityStatus = 'exceeded'; errors.push({ field: 'flash_capacity', message: `Address overflow detected for "${bin.fileName}".`, severity: 'error' }); } else if (end > detectedCapacityBytes) { flashCapacityStatus = 'exceeded'; errors.push({ field: 'flash_capacity', message: `File "${bin.fileName}" exceeds detected flash capacity.`, severity: 'error' }); } } }
    return { isValid: errors.length === 0, errors, warnings, flashCapacityStatus };
  }
  public static parseFlashCapacityBytes(flashSizeStr?: string): number | null { if (!flashSizeStr || !flashSizeStr.toLowerCase().startsWith('detected:')) return null; const normalized = flashSizeStr.slice('detected:'.length).toUpperCase().replace(/\s/g, ''); const match = normalized.match(/^(\d+(?:\.\d+)?)(MB|KB)$/); if (!match) return null; const value = Number(match[1]); if (!Number.isFinite(value) || value <= 0) return null; return match[2] === 'MB' ? value * 1024 * 1024 : value * 1024; }
}
