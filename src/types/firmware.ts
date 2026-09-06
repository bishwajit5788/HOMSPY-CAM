import type { FlashMode, FlashFreq, FlashSize } from './esp32';

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
}
