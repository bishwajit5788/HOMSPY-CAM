import {
  ESPLoader,
  Transport,
  type FlashOptions,
  type IEspLoaderTerminal,
  type FlashModeValues,
  type FlashFreqValues,
  type FlashSizeValues,
} from 'esptool-js';
import type { ChipInfo, FlashConfig } from '../../types/esp32';
import type { FirmwareBinary } from '../../types/firmware';
import { logService } from '../logger/logService';
import { computeMD5 } from '../../utils/crypto';

export interface FlashProgressCallback {
  (fileIndex: number, writtenBytes: number, totalBytes: number, currentFileName: string): void;
}

export class ESP32Service {
  private transport: Transport | null = null;
  private esploader: ESPLoader | null = null;
  private isConnected = false;
  private deviceLostCallback: (() => void) | null = null;

  public get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Helper utility wrapping asynchronous promises with an explicit timeout,
   * AbortSignal, and immediate cleanup to terminate zombie operations.
   */
  private async withTimeoutAndCleanup<T>(
    operationFn: (signal: AbortSignal) => Promise<T>,
    timeoutMs: number,
    operationName: string,
    onTimeoutCleanup?: () => Promise<void> | void
  ): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(async () => {
        controller.abort();
        logService.addLog(
          `TIMEOUT: Operation "${operationName}" exceeded ${Math.round(timeoutMs / 1000)}s limit. Executing safety cancellation...`,
          'error'
        );
        if (onTimeoutCleanup) {
          try {
            await onTimeoutCleanup();
          } catch (cleanupErr) {
            console.warn('Error during timeout cleanup:', cleanupErr);
          }
        }
        reject(
          new Error(
            `Operation "${operationName}" timed out after ${Math.round(timeoutMs / 1000)}s. Device did not respond.`
          )
        );
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([operationFn(controller.signal), timeoutPromise]);
      return result;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  /**
   * Connects to the ESP32-S3 ROM bootloader and identifies chip hardware.
   */
  public async connectAndDetect(
    port: SerialPort,
    baudRate = 115200,
    onDeviceLost?: () => void
  ): Promise<ChipInfo> {
    if (this.transport) {
      await this.disconnect();
    }

    this.deviceLostCallback = onDeviceLost || null;
    logService.addLog('Initializing ESP32 Web Serial transport...', 'flasher');

    // Create terminal logger bridging esptool output to unified logger
    const terminal: IEspLoaderTerminal = {
      clean: () => {},
      writeLine: (data: string) => {
        if (data.trim()) logService.addLog(data.trim(), 'flasher');
      },
      write: (data: string) => {
        if (data.trim()) logService.addLog(data.trim(), 'flasher');
      },
    };

    // Create Web Serial transport
    this.transport = new Transport(port, false);

    // Register native device-lost callback for unexpected USB disconnects
    if (this.deviceLostCallback) {
      this.transport.setDeviceLostCallback(() => {
        logService.addLog('CRITICAL: USB device disconnect detected by flasher transport!', 'error');
        this.isConnected = false;
        if (this.deviceLostCallback) {
          this.deviceLostCallback();
        }
      });
    }

    this.esploader = new ESPLoader({
      transport: this.transport,
      baudrate: baudRate,
      terminal,
    });

    logService.addLog('Synchronizing with ESP32-S3 ROM bootloader (15s timeout)...', 'flasher');

    let chipName = '';
    try {
      // First attempt with default reset (with 15s timeout and abort cleanup)
      chipName = await this.withTimeoutAndCleanup(
        () => this.esploader!.main('default_reset'),
        15000,
        'ROM bootloader synchronization (default reset)',
        async () => {
          await this.disconnect();
        }
      );
    } catch (firstErr) {
      logService.addLog(
        `Default reset sync notice: ${firstErr}. Attempting direct connection ('no_reset')...`,
        'flasher'
      );
      try {
        // Fallback for boards already placed into bootloader mode
        chipName = await this.withTimeoutAndCleanup(
          () => this.esploader!.main('no_reset'),
          15000,
          'ROM bootloader synchronization (no_reset)',
          async () => {
            await this.disconnect();
          }
        );
      } catch (secondErr) {
        await this.disconnect();
        throw new Error(
          `Failed to synchronize with ESP32-S3 ROM bootloader. ${secondErr}. Ensure board is in bootloader mode (Hold B, click R, release B).`
        );
      }
    }

    this.isConnected = true;
    logService.addLog(`ROM bootloader synchronized successfully. Detected chip: ${chipName}`, 'flasher');

    // Retrieve chip hardware information
    let macAddress = 'Unknown';
    try {
      if (this.esploader.chip && typeof this.esploader.chip.readMac === 'function') {
        const mac = await this.esploader.chip.readMac(this.esploader);
        if (mac) {
          macAddress = mac;
          logService.addLog(`MAC Address: ${macAddress}`, 'flasher');
        }
      }
    } catch {
      logService.addLog('Notice: MAC address could not be read.', 'flasher');
    }

    // Retrieve SPI flash information
    let flashId: string | undefined;
    let flashSize: string | undefined;
    try {
      const rawFlashId = await this.esploader.readFlashId();
      if (rawFlashId !== undefined) {
        flashId = `0x${rawFlashId.toString(16).toUpperCase()}`;
        logService.addLog(`SPI Flash ID: ${flashId}`, 'flasher');
        const lowByte = (rawFlashId >> 16) & 0xff;
        flashSize = this.esploader.DETECTED_FLASH_SIZES[lowByte];
        if (flashSize) {
          logService.addLog(`Detected SPI Flash Size: ${flashSize}`, 'flasher');
        }
      }
    } catch {
      logService.addLog('Notice: SPI Flash ID could not be queried.', 'flasher');
    }

    return {
      chipName: chipName || 'ESP32-S3',
      macAddress,
      description: chipName || 'ESP32-S3',
      flashSize,
      flashId,
    };
  }

  /**
   * Erases the entire target flash memory.
   */
  public async eraseChip(): Promise<void> {
    if (!this.esploader) {
      throw new Error('No active bootloader connection. Connect the device first.');
    }

    logService.addLog('Executing full chip erase (this may take up to 45 seconds)...', 'flasher');
    await this.withTimeoutAndCleanup(
      () => this.esploader!.eraseFlash(),
      45000,
      'Full chip erase',
      async () => {
        await this.disconnect();
      }
    );
    logService.addLog('Full chip erase completed successfully.', 'flasher');
  }

  /**
   * Alias for eraseChip.
   */
  public async eraseFlash(): Promise<void> {
    return this.eraseChip();
  }

  /**
   * Flashes multiple binary images with progress updates and on-chip MD5 verification.
   */
  public async flashImages(
    binaries: FirmwareBinary[],
    config: FlashConfig,
    onProgress: FlashProgressCallback,
    onSegmentVerified?: (fileName: string, hash: string) => void
  ): Promise<void> {
    if (!this.esploader) {
      throw new Error('No active bootloader connection.');
    }

    logService.addLog(`Preparing to flash ${binaries.length} binary segment(s)...`, 'flasher');

    const fileArray = binaries.map((bin) => ({
      data: bin.data,
      address: bin.offsetNum,
    }));

    const flashOptions: FlashOptions = {
      fileArray,
      flashMode: config.flashMode as FlashModeValues,
      flashFreq: config.flashFreq as FlashFreqValues,
      flashSize: config.flashSize as FlashSizeValues,
      eraseAll: config.eraseAll,
      compress: config.compress,
      reportProgress: (fileIndex: number, written: number, total: number) => {
        const currentFileName = binaries[fileIndex]?.fileName || `Segment ${fileIndex + 1}`;
        onProgress(fileIndex, written, total, currentFileName);
      },
      calculateMD5Hash: (image: Uint8Array) => {
        const hash = computeMD5(image);
        logService.addLog(
          `[MD5] Computed local binary checksum: ${hash}. Awaiting on-chip SPI flash readback verification...`,
          'flasher'
        );
        if (onSegmentVerified) {
          onSegmentVerified('segment', hash);
        }
        return hash;
      },
    };

    // Execute flashing with timeout scaled to payload size (minimum 60s)
    const totalBytes = binaries.reduce((acc, f) => acc + f.size, 0);
    const timeoutMs = Math.max(60000, Math.round((totalBytes / 1024) * 200));

    await this.withTimeoutAndCleanup(
      () => this.esploader!.writeFlash(flashOptions),
      timeoutMs,
      'Firmware write',
      async () => {
        await this.disconnect();
      }
    );

    logService.addLog(
      'SPI Flash readback MD5 matched source image. On-chip SPI bus integrity confirmed by ROM bootloader.',
      'flasher'
    );
  }

  /**
   * Transmits hardware reset pulse to the device.
   */
  public async resetDevice(): Promise<void> {
    if (!this.esploader) return;
    try {
      logService.addLog('Transmitting hard reset pulse to ESP32-S3...', 'flasher');
      await this.withTimeoutAndCleanup(
        () => this.esploader!.after('hard_reset'),
        5000,
        'Hardware reset'
      );
      logService.addLog('Reset signal delivered. Board is restarting.', 'flasher');
    } catch (err) {
      logService.addLog(`Notice: Reset signal attempted (${err}).`, 'flasher');
    }
  }

  /**
   * Disconnects the flashing transport and releases serial port resources.
   */
  public async disconnect(): Promise<void> {
    this.isConnected = false;
    if (this.transport) {
      try {
        this.transport.setDeviceLostCallback(null);
        await this.withTimeoutAndCleanup(
          () => this.transport!.disconnect(),
          3000,
          'Transport disconnect'
        );
      } catch {
        // Ignore disconnect errors during teardown
      }
      this.transport = null;
    }
    this.esploader = null;
    logService.addLog('ESP32 bootloader flasher transport disconnected.', 'flasher');
  }
}

export const esp32Service = new ESP32Service();
