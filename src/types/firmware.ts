import type { FlashMode, FlashFreq, FlashSize } from './esp32';

export type FirmwareTrustLevel = 'official_verified' | 'unverified_custom';
export type FlashCapacityStatus = 'verified' | 'unknown' | 'exceeded';

export interface ManifestFileEntry {
  path: string;
  offset: string;
  description?: string;
  /** Expected byte length of the file */
  size?: number;
  /** Legacy alias for size; normalized to size during parsing */
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
}

export interface FirmwareBinary {
  id: string;
  fileName: string;
  offsetHex: string;
  offsetNum: number;
  data: Uint8Array;
  /** Exact byte length of data buffer */
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
  flashCapacityStatus?: FlashCapacityStatus;
}
