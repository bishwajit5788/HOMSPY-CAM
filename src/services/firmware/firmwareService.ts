import type { FirmwarePackage, FirmwareManifest, FirmwareBinary } from '../../types/firmware';
import { parseHexAddress, formatHexAddress } from '../../utils/formatters';
import { computeMD5, computeSHA256 } from '../../utils/crypto';
import { FirmwareValidator } from './firmwareValidator';

export class FirmwareService {
  public async loadBuiltinCameraPackage(): Promise<FirmwarePackage> {
    const basePath = '/firmware/xiao_esp32s3_camera';
    const manifestUrl = `${basePath}/manifest.json`;
    const manifestRes = await fetch(manifestUrl);
    if (!manifestRes.ok) throw new Error(`Failed to load built-in manifest (${manifestRes.status})`);
    const manifest: FirmwareManifest = await manifestRes.json();
    this.validateManifest(manifest);

    const binaries: FirmwareBinary[] = [];
    for (const fileEntry of manifest.files) {
      const response = await fetch(`${basePath}/${fileEntry.path}`);
      if (!response.ok) throw new Error(`Failed to load binary ${fileEntry.path} (${response.status})`);
      const uint8 = new Uint8Array(await response.arrayBuffer());
      const offsetNum = parseHexAddress(fileEntry.offset);
      const md5 = computeMD5(uint8);
      const sha256 = await computeSHA256(uint8);
      const expectedSize = fileEntry.size ?? fileEntry.expectedSize;
      if (expectedSize !== undefined && uint8.byteLength !== expectedSize) throw new Error(`Payload size mismatch for "${fileEntry.path}".`);
      if (fileEntry.sha256 && fileEntry.sha256.toLowerCase() !== sha256.toLowerCase()) throw new Error(`Firmware SHA-256 mismatch for "${fileEntry.path}".`);
      binaries.push({ id: `builtin-${fileEntry.path}`, fileName: fileEntry.path, offsetHex: formatHexAddress(offsetNum), offsetNum, data: uint8, size: uint8.byteLength, sha256, md5, isValid: true, description: fileEntry.description });
    }

    const pkg: FirmwarePackage = {
      name: manifest.name,
      version: manifest.version,
      chip: manifest.chip,
      board: manifest.board,
      description: manifest.description,
      flashMode: manifest.flash_mode || 'dio',
      flashFreq: manifest.flash_freq || '80m',
      flashSize: manifest.flash_size || '8MB',
      files: binaries,
      totalSize: binaries.reduce((acc, f) => acc + f.size, 0),
      source: 'builtin',
      trustLevel: 'official_verified',
      trustReason: 'Official built-in firmware with pinned SHA-256 checksums.',
    };

    // The built-in manifest is the source of truth for its declared package capacity;
    // runtime flashing still re-validates against the actually detected device capacity.
    const declaredCapacity = FirmwareValidator.parseFlashCapacityBytes(manifest.flash_size);
    const result = FirmwareValidator.validatePackage(pkg, declaredCapacity, manifest.chip);
    pkg.flashCapacityStatus = result.flashCapacityStatus;
    if (!result.isValid) throw new Error(result.errors.map((e) => e.message).join('\n'));
    return pkg;
  }

  public validateManifest(manifest: unknown): asserts manifest is FirmwareManifest {
    const result = FirmwareValidator.validateManifestSchema(manifest);
    if (!result.isValid) throw new Error(result.errors.map((e) => e.message).join('\n'));
  }

  public async createPackageFromManifestAndFiles(manifestText: string, files: File[]): Promise<FirmwarePackage> {
    let manifest: FirmwareManifest;
    try { manifest = JSON.parse(manifestText); } catch { throw new Error('Malformed manifest JSON.'); }
    this.validateManifest(manifest);
    const fileMap = new Map(files.map((f) => [f.name.toLowerCase(), f]));
    const binaries: FirmwareBinary[] = [];
    for (const entry of manifest.files) {
      const baseName = entry.path.split('/').pop()?.toLowerCase() || '';
      const file = fileMap.get(baseName);
      if (!file) throw new Error(`Manifest specifies "${entry.path}", but no matching file was uploaded.`);
      const uint8 = new Uint8Array(await file.arrayBuffer());
      const offsetNum = parseHexAddress(entry.offset);
      const md5 = computeMD5(uint8);
      const sha256 = await computeSHA256(uint8);
      const expectedSize = entry.size ?? entry.expectedSize;
      if (expectedSize !== undefined && uint8.byteLength !== expectedSize) throw new Error(`Payload size mismatch for "${file.name}".`);
      if (entry.sha256 && entry.sha256.toLowerCase() !== sha256.toLowerCase()) throw new Error(`Firmware SHA-256 mismatch for "${file.name}".`);
      binaries.push({ id: `manifest-${file.name}-${Date.now()}`, fileName: file.name, offsetHex: formatHexAddress(offsetNum), offsetNum, data: uint8, size: uint8.byteLength, sha256, md5, isValid: uint8.byteLength > 0, description: entry.description });
    }
    const pkg: FirmwarePackage = {
      name: manifest.name, version: manifest.version, chip: manifest.chip, board: manifest.board,
      description: manifest.description, flashMode: manifest.flash_mode || 'dio', flashFreq: manifest.flash_freq || '80m',
      flashSize: manifest.flash_size || '8MB', files: binaries,
      totalSize: binaries.reduce((acc, f) => acc + f.size, 0), source: 'manifest',
      trustLevel: 'unverified_custom',
      trustReason: 'Custom manifest package; authenticity is not established by this application.',
    };
    const result = FirmwareValidator.validatePackage(pkg, null, pkg.chip);
    pkg.flashCapacityStatus = result.flashCapacityStatus;
    if (!result.isValid) throw new Error(result.errors.map((e) => e.message).join('\n'));
    return pkg;
  }

  public async createPackageFromCustomFiles(fileEntries: { file: File; offsetHex: string; description?: string }[]): Promise<FirmwarePackage> {
    if (!fileEntries.length) throw new Error('Please select at least one binary (.bin) file to flash.');
    const binaries: FirmwareBinary[] = [];
    for (const [idx, item] of fileEntries.entries()) {
      const uint8 = new Uint8Array(await item.file.arrayBuffer());
      const offsetNum = parseHexAddress(item.offsetHex);
      const md5 = computeMD5(uint8);
      const sha256 = await computeSHA256(uint8);
      binaries.push({ id: `custom-${idx}-${item.file.name}`, fileName: item.file.name, offsetHex: formatHexAddress(offsetNum), offsetNum, data: uint8, size: uint8.byteLength, sha256, md5, isValid: uint8.byteLength > 0, validationError: uint8.byteLength ? undefined : 'File is empty (0 bytes).', description: item.description });
    }
    const pkg: FirmwarePackage = {
      name: 'Custom ESP32-S3 Firmware', version: 'Custom Build', chip: 'ESP32-S3', board: 'Seeed Studio XIAO ESP32S3 Sense',
      flashMode: 'dio', flashFreq: '80m', flashSize: '8MB', files: binaries,
      totalSize: binaries.reduce((acc, f) => acc + f.size, 0), source: 'custom', trustLevel: 'unverified_custom',
      trustReason: 'Manual binary upload; authenticity and flash capacity require explicit verification.',
    };
    const result = FirmwareValidator.validatePackage(pkg, null, 'ESP32-S3');
    pkg.flashCapacityStatus = result.flashCapacityStatus;
    if (!result.isValid) throw new Error(result.errors.map((e) => e.message).join('\n'));
    return pkg;
  }
}

export const firmwareService = new FirmwareService();
