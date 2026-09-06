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
import { computeMD5 } from '../../utils/md5';

export interface FlashProgressCallback {
  (fileIndex: number, writtenBytes: number, totalBytes: number, currentFileName: string): void;
}

export class ESP32Service {
  private transport: Transport | null = null;
  private esploader: ESPLoader | null = null;
  private isConnected = false;

  public get connected(): boolean {
    return this.isConnected;
  }

  /**
   * Connects to the ESP32-S3 ROM bootloader and identifies chip hardware.
   */
  public async connectAndDetect(
    port: SerialPort,
    baudRate = 115200
  ): Promise<ChipInfo> {
    if (this.transport) {
      await this.disconnect();
    }

    logService.addLog('Initializing ESP32 transport...', 'flasher');

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

    this.esploader = new ESPLoader({
      transport: this.transport,
      baudrate: baudRate,
      terminal,
    });

    logService.addLog('Synchronizing with ESP32-S3 ROM bootloader...', 'flasher');

    let chipName = '';
    try {
      // First attempt with default reset
      chipName = await this.esploader.main('default_reset');
    } catch (firstErr) {
      logService.addLog(`Standard reset sync failed: ${firstErr}. Trying with direct connection...`, 'flasher');
      try {
        // Fallback for boards already placed into bootloader mode
        chipName = await this.esploader.main('no_reset');
      } catch (secondErr) {
        throw new Error(
          `ESP32-S3 bootloader not detected. Please verify the board is in download mode (Hold BOOT, press RESET, release BOOT) and retry. (${secondErr})`
        );
      }
    }

    this.isConnected = true;
    logService.addLog(`Bootloader synced successfully. Chip identified: ${chipName}`, 'flasher');

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
      flashSize = await this.esploader.detectFlashSize();
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

    logService.addLog('Erasing entire flash memory (this may take up to 20-30 seconds)...', 'flasher');
    await this.esploader.eraseFlash();
    logService.addLog('Flash memory erase completed successfully.', 'flasher');
  }

  /**
   * Flashes multiple binary images with progress updates and MD5 verification.
   */
  public async flashImages(
    binaries: FirmwareBinary[],
    config: FlashConfig,
    onProgress: FlashProgressCallback
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
        logService.addLog(`Verifying MD5 checksum: ${hash}`, 'flasher');
        return hash;
      },
    };

    await this.esploader.writeFlash(flashOptions);
    logService.addLog('Firmware written and verified successfully.', 'flasher');

    // Trigger post-flash hard reset
    try {
      logService.addLog('Resetting ESP32-S3 into execution mode...', 'flasher');
      await this.esploader.after('hard_reset');
    } catch (resetErr) {
      logService.addLog(`Notice: Software reset signal sent. (${resetErr})`, 'flasher');
    }
  }

  /**
   * Resets the device.
   */
  public async resetDevice(): Promise<void> {
    if (!this.esploader) return;
    try {
      await this.esploader.after('hard_reset');
      logService.addLog('Device hard reset triggered.', 'flasher');
    } catch (err) {
      logService.addLog(`Reset command error: ${err}`, 'flasher');
    }
  }

  /**
   * Disconnects the flashing transport and releases serial port resources.
   */
  public async disconnect(): Promise<void> {
    this.isConnected = false;
    if (this.transport) {
      try {
        await this.transport.disconnect();
      } catch {
        // Ignore disconnect errors
      }
      this.transport = null;
    }
    this.esploader = null;
    logService.addLog('ESP32 bootloader flasher disconnected.', 'flasher');
  }
}

export const esp32Service = new ESP32Service();
