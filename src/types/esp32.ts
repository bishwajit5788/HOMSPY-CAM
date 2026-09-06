export type FlashMode = 'qio' | 'qout' | 'dio' | 'dout';
export type FlashFreq = '40m' | '80m' | '26m' | '20m';
export type FlashSize = 'detect' | '2MB' | '4MB' | '8MB' | '16MB' | '32MB';

export interface ChipInfo {
  chipName: string;
  macAddress: string;
  description: string;
  flashId?: string;
  flashSize?: string;
  vendorId?: string;
  productId?: string;
  features?: string[];
  crystalFreq?: string;
}

export interface FlashProgress {
  stage:
    | 'idle'
    | 'preparing'
    | 'validating'
    | 'erasing'
    | 'writing'
    | 'verifying'
    | 'resetting'
    | 'complete'
    | 'failed';
  stageText: string;
  fileIndex: number;
  totalFiles: number;
  currentFileName: string;
  writtenBytes: number;
  totalBytes: number;
  percentage: number;
  elapsedSeconds: number;
  speedKbps: number;
}

export interface FlashConfig {
  flashMode: FlashMode;
  flashFreq: FlashFreq;
  flashSize: FlashSize;
  eraseAll: boolean;
  compress: boolean;
}

export interface BoardProfile {
  id: string;
  name: string;
  manufacturer: string;
  mcu: string;
  psram: string;
  flashSize: FlashSize;
  recommendedFlashMode: FlashMode;
  recommendedFlashFreq: FlashFreq;
  defaultOffsets: {
    bootloader: string;
    partitions: string;
    firmware: string;
  };
  features: string[];
  bootloaderGuide: {
    steps: string[];
    usbVendorId?: number;
    usbProductId?: number;
  };
}
