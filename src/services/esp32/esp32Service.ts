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
   * Helper utility wrapping asynchronous promises with an explicit timeout.
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operationName: string
  ): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeoutPromise = new Promise<T>((_, reject) => {
      timer = setTimeout(() => {
        reject(
          new Error(
            `Operation "${operationName}" timed out after ${Math.round(timeoutMs / 1000)}s. Device did not respond.`
          )
        );
      }, timeoutMs);
    });

    try {
      const result = await Promise.race([promise, timeoutPromise]);
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
      // First attempt with default reset (with 15s timeout)
      chipName = await this.withTimeout(
        this.esploader.main('default_reset'),
        15000,
        'ROM bootloader synchronization (default reset)'
      );
    } catch (firstErr) {
      logService.addLog(
        `Default reset sync notice: ${firstErr}. Attempting direct connection ('no_reset')...`,
        'flasher'
      );
      try {
        // Fallback for boards already placed into bootloader mode
        chipName = await this.withTimeout(
          this.esploader.main('no_reset'),
          10000,
          'ROM bootloader synchronization (direct)'
        );
      } catch (secondErr) {
        throw new Error(
          `ESP32-S3 bootloader not detected. Please verify the board is in download mode (Hold BOOT, press RESET, release BOOT) and retry. (${secondErr})`
        );
      }
    }

    this.isConnected = true;
    logService.addLog(`Bootloader synchronized successfully. Identified chip: ${chipName}`, 'flasher');

    // Read Hardware MAC Address
    let macAddress = 'Unknown';
    try {
      if (this.esploader.chip) {
        macAddress = await this.esploader.chip.readMac(this.esploader);
      }
    } catch {
      // Non-fatal if MAC cannot be read
    }

    // Detect Flash Size
    let flashSize = '8MB';
    try {
      flashSize = await this.withTimeout(
        this.esploader.detectFlashSize(),
        5000,
        'Flash size detection'
      );
    } catch {
      flashSize = '8MB (Default for XIAO ESP32S3 Sense)';
    }

    // Read SPI Flash ID
    let flashIdHex: string | undefined;
    try {
      const flashId = await this.esploader.readFlashId();
      flashIdHex = `0x${flashId.toString(16).toUpperCase()}`;
    } catch {
      // Ignore if not readable
    }

    const portInfo = port.getInfo();
    const vendorId = portInfo.usbVendorId ? `0x${portInfo.usbVendorId.toString(16)}` : undefined;
    const productId = portInfo.usbProductId ? `0x${portInfo.usbProductId.toString(16)}` : undefined;

    const chipInfo: ChipInfo = {
      chipName,
      macAddress,
      description: `${chipName} (${flashSize} Flash)`,
      flashSize,
      flashId: flashIdHex,
      vendorId,
      productId,
      features: ['Wi-Fi 802.11 b/g/n', 'Bluetooth 5.0 (BLE)', 'Dual-core LX7', 'OPI PSRAM Support'],
    };

    return chipInfo;
  }

  /**
   * Erases the entire flash memory of the connected ESP32-S3.
   */
  public async eraseFlash(): Promise<void> {
    if (!this.esploader) {
      throw new Error('No active bootloader connection. Please connect first.');
    }

    logService.addLog('Erasing entire flash memory (45s timeout, please wait)...', 'flasher');
    await this.withTimeout(this.esploader.eraseFlash(), 45000, 'Flash chip erase');
    logService.addLog('Flash memory erase completed successfully.', 'flasher');
  }

  /**
   * Flashes multiple binary images with progress updates and MD5 verification.
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
        logService.addLog(`[MD5] Computed payload checksum: ${hash}`, 'flasher');
        if (onSegmentVerified) {
          onSegmentVerified('segment', hash);
        }
        return hash;
      },
    };

    // Execute flashing with timeout scaled to payload size (minimum 60s)
    const totalBytes = binaries.reduce((acc, f) => acc + f.size, 0);
    const timeoutMs = Math.max(60000, Math.round((totalBytes / 1024) * 200));

    await this.withTimeout(this.esploader.writeFlash(flashOptions), timeoutMs, 'Firmware write');
    logService.addLog('Firmware writing and on-chip verification completed successfully.', 'flasher');
  }

  /**
   * Resets the device.
   */
  public async resetDevice(): Promise<void> {
    if (!this.esploader) return;
    try {
      logService.addLog('Transmitting hard reset pulse to ESP32-S3...', 'flasher');
      await this.withTimeout(this.esploader.after('hard_reset'), 5000, 'Hardware reset');
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
        await this.withTimeout(this.transport.disconnect(), 3000, 'Transport disconnect');
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
