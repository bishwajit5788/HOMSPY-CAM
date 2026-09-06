import type { FlashMode, FlashFreq, FlashSize } from './esp32';

export type FirmwareTrustLevel = 'official_verified' | 'signed_verified' | 'unverified_custom';
export type FlashCapacityStatus = 'verified' | 'unknown' | 'exceeded';

export interface FirmwareSignature {
  algorithm: 'ECDSA-P256-SHA256';
  keyId: string;
  signature: string;
}

export interface ManifestFileEntry {
  path: string;
  offset: string;
  description?: string;
  size?: number;
  expectedSize?: number;
  sha256?: string;
  md5?: string;
}

export interface FirmwareManifest {
  name: string;
  version: string;
  chip: string;
  board?: string;
  description?: string;
  flash_size?: FlashSize;
  flash_mode?: FlashMode;
  flash_freq?: FlashFreq;
  files: ManifestFileEntry[];
  /** Signature covers the canonical manifest with this field removed. */
  signature?: FirmwareSignature;
}

export interface FirmwareBinary {
  id: string;
  fileName: string;
  offsetHex: string;
  offsetNum: number;
  data: Uint8Array;
  size: number;
  sha256: string;
  md5: string;
  isValid: boolean;
  validationError?: string;
  description?: string;
}

export interface FirmwarePackage {
  name: string;
  version: string;
  chip: string;
  board?: string;
  description?: string;
  flashMode: FlashMode;
  flashFreq: FlashFreq;
  flashSize: FlashSize;
  files: FirmwareBinary[];
  totalSize: number;
  source: 'builtin' | 'manifest' | 'custom';
  trustLevel: FirmwareTrustLevel;
  trustReason: string;
  signature?: FirmwareSignature;
  flashCapacityStatus?: FlashCapacityStatus;
}
