import type {
  FirmwarePackage,
  FirmwareManifest,
  FirmwareBinary,
} from '../../types/firmware';
import { parseHexAddress, formatHexAddress } from '../../utils/formatters';
import { computeMD5, computeSHA256 } from '../../utils/crypto';
import { FirmwareValidator } from './firmwareValidator';

export class FirmwareService {
  /**
   * Loads the built-in Stage 1 XIAO ESP32S3 Sense camera firmware.
   */
  public async loadBuiltinCameraPackage(): Promise<FirmwarePackage> {
    const basePath = '/firmware/xiao_esp32s3_camera';
    const manifestUrl = `${basePath}/manifest.json`;

    const manifestRes = await fetch(manifestUrl);
    if (!manifestRes.ok) {
      throw new Error(`Failed to load built-in manifest from ${manifestUrl} (${manifestRes.status})`);
    }

    const manifest: FirmwareManifest = await manifestRes.json();
    this.validateManifest(manifest);

    const binaries: FirmwareBinary[] = [];

    for (const fileEntry of manifest.files) {
      const fileUrl = `${basePath}/${fileEntry.path}`;
      const binRes = await fetch(fileUrl);
      if (!binRes.ok) {
        throw new Error(`Failed to load binary ${fileEntry.path} (${binRes.status})`);
      }

      const buffer = await binRes.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      const offsetNum = parseHexAddress(fileEntry.offset);
      const md5 = computeMD5(uint8);
      const sha256 = await computeSHA256(uint8);

      // Verify file size if specified in manifest
      if (fileEntry.size !== undefined && uint8.byteLength !== fileEntry.size) {
        throw new Error(
          `Payload size mismatch for "${fileEntry.path}". Expected ${fileEntry.size} bytes, but received ${uint8.byteLength} bytes.`
        );
      }

      // Verify cryptographic SHA-256 integrity if specified in manifest
      if (fileEntry.sha256) {
        const expected = fileEntry.sha256.toLowerCase();
        const actual = sha256.toLowerCase();
        if (expected !== actual) {
          throw new Error(
            `Firmware integrity validation FAILED for "${fileEntry.path}". SHA-256 mismatch!\nExpected: ${expected}\nComputed: ${actual}`
          );
        }
      }

      binaries.push({
        id: `builtin-${fileEntry.path}`,
        fileName: fileEntry.path,
        offsetHex: formatHexAddress(offsetNum),
        offsetNum,
        data: uint8,
        size: uint8.byteLength,
        sha256,
        md5,
        isValid: uint8.byteLength > 0,
        description: fileEntry.description,
      });
    }

    const totalSize = binaries.reduce((acc, f) => acc + f.size, 0);

    const pkg: FirmwarePackage = {
      name: manifest.name || 'XIAO ESP32S3 Camera',
      version: manifest.version || '1.0.0',
      chip: manifest.chip || 'ESP32-S3',
      board: manifest.board || 'Seeed Studio XIAO ESP32S3 Sense',
      description: manifest.description,
      flashMode: manifest.flash_mode || 'dio',
      flashFreq: manifest.flash_freq || '80m',
      flashSize: manifest.flash_size || '8MB',
      files: binaries,
      totalSize,
      source: 'builtin',
    };

    // Run deep structural package validation
    const valResult = FirmwareValidator.validatePackage(pkg, 8 * 1024 * 1024, 'ESP32-S3');
    if (!valResult.isValid) {
      throw new Error(valResult.errors.map((e) => e.message).join('\n'));
    }

    return pkg;
  }

  /**
   * Validates manifest structure and required attributes.
   */
  public validateManifest(manifest: unknown): asserts manifest is FirmwareManifest {
    const result = FirmwareValidator.validateManifestSchema(manifest);
    if (!result.isValid) {
      throw new Error(result.errors.map((e) => e.message).join('\n'));
    }
  }

  /**
   * Creates a firmware package from a manifest JSON and corresponding File objects.
   */
  public async createPackageFromManifestAndFiles(
    manifestText: string,
    files: File[]
  ): Promise<FirmwarePackage> {
    let manifest: FirmwareManifest;
    try {
      manifest = JSON.parse(manifestText);
    } catch {
      throw new Error('Malformed manifest JSON. Please check JSON syntax.');
    }

    this.validateManifest(manifest);

    const fileMap = new Map<string, File>();
    for (const f of files) {
      fileMap.set(f.name.toLowerCase(), f);
    }

    const binaries: FirmwareBinary[] = [];

    for (const entry of manifest.files) {
      const baseName = entry.path.split('/').pop()?.toLowerCase() || '';
      const matchedFile = fileMap.get(baseName);

      if (!matchedFile) {
        throw new Error(`Manifest specifies "${entry.path}", but no matching file was uploaded.`);
      }

      const buffer = await matchedFile.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      const offsetNum = parseHexAddress(entry.offset);
      const md5 = computeMD5(uint8);
      const sha256 = await computeSHA256(uint8);

      // Verify file size if specified
      if (entry.size !== undefined && uint8.byteLength !== entry.size) {
        throw new Error(
          `Payload size mismatch for "${matchedFile.name}". Expected ${entry.size} bytes, but received ${uint8.byteLength} bytes.`
        );
      }

      // Verify SHA-256 checksum if declared
      if (entry.sha256) {
        const expected = entry.sha256.toLowerCase();
        const actual = sha256.toLowerCase();
        if (expected !== actual) {
          throw new Error(
            `Firmware integrity validation FAILED for "${matchedFile.name}". SHA-256 mismatch!\nExpected: ${expected}\nComputed: ${actual}`
          );
        }
      }

      binaries.push({
        id: `manifest-${matchedFile.name}-${Date.now()}`,
        fileName: matchedFile.name,
        offsetHex: formatHexAddress(offsetNum),
        offsetNum,
        data: uint8,
        size: uint8.byteLength,
        sha256,
        md5,
        isValid: uint8.byteLength > 0,
        description: entry.description,
      });
    }

    const totalSize = binaries.reduce((acc, f) => acc + f.size, 0);

    const pkg: FirmwarePackage = {
      name: manifest.name,
      version: manifest.version || '1.0.0',
      chip: manifest.chip || 'ESP32-S3',
      board: manifest.board,
      description: manifest.description,
      flashMode: manifest.flash_mode || 'dio',
      flashFreq: manifest.flash_freq || '80m',
      flashSize: manifest.flash_size || '8MB',
      files: binaries,
      totalSize,
      source: 'manifest',
    };

    const valResult = FirmwareValidator.validatePackage(pkg, undefined, pkg.chip);
    if (!valResult.isValid) {
      throw new Error(valResult.errors.map((e) => e.message).join('\n'));
    }

    return pkg;
  }

  /**
   * Creates a package from manually selected .bin files and explicit offsets.
   */
  public async createPackageFromCustomFiles(
    fileEntries: { file: File; offsetHex: string; description?: string }[]
  ): Promise<FirmwarePackage> {
    if (fileEntries.length === 0) {
      throw new Error('Please select at least one binary (.bin) file to flash.');
    }

    const binaries: FirmwareBinary[] = [];

    for (const [idx, item] of fileEntries.entries()) {
      const buffer = await item.file.arrayBuffer();
      const uint8 = new Uint8Array(buffer);
      const offsetNum = parseHexAddress(item.offsetHex);
      const md5 = computeMD5(uint8);
      const sha256 = await computeSHA256(uint8);

      let isValid = true;
      let validationError: string | undefined;

      if (uint8.byteLength === 0) {
        isValid = false;
        validationError = 'File is empty (0 bytes).';
      }

      binaries.push({
        id: `custom-${idx}-${item.file.name}`,
        fileName: item.file.name,
        offsetHex: formatHexAddress(offsetNum),
        offsetNum,
        data: uint8,
        size: uint8.byteLength,
        sha256,
        md5,
        isValid,
        validationError,
        description: item.description,
      });
    }

    const totalSize = binaries.reduce((acc, f) => acc + f.size, 0);

    const pkg: FirmwarePackage = {
      name: 'Custom ESP32-S3 Firmware',
      version: 'Custom Build',
      chip: 'ESP32-S3',
      board: 'Seeed Studio XIAO ESP32S3 Sense',
      flashMode: 'dio',
      flashFreq: '80m',
      flashSize: '8MB',
      files: binaries,
      totalSize,
      source: 'custom',
    };

    const valResult = FirmwareValidator.validatePackage(pkg, undefined, 'ESP32-S3');
    if (!valResult.isValid) {
      throw new Error(valResult.errors.map((e) => e.message).join('\n'));
    }

    return pkg;
  }
}

export const firmwareService = new FirmwareService();
