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

export interface FlashProgressCallback { (fileIndex: number, writtenBytes: number, totalBytes: number, currentFileName: string): void; }

export class ESP32Service {
  private transport: Transport | null = null;
  private esploader: ESPLoader | null = null;
  private isConnected = false;
  private detectedChipName = '';
  private deviceLostCallback: (() => void) | null = null;

  public get connected(): boolean { return this.isConnected; }

  private async withTimeoutAndCleanup<T>(operationFn: (signal: AbortSignal) => Promise<T>, timeoutMs: number, operationName: string, onTimeoutCleanup?: () => Promise<void> | void): Promise<T> {
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;
    const operation = operationFn(controller.signal);
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(async () => {
        controller.abort();
        logService.addLog(`TIMEOUT: Operation "${operationName}" exceeded ${Math.round(timeoutMs / 1000)}s. Enforcing transport cancellation.`, 'error');
        try { await onTimeoutCleanup?.(); } catch (cleanupErr) { console.warn('Timeout cleanup failed:', cleanupErr); }
        reject(new Error(`Operation "${operationName}" timed out after ${Math.round(timeoutMs / 1000)}s.`));
      }, timeoutMs);
    });
    try { return await Promise.race([operation, timeout]); }
    finally { if (timer) clearTimeout(timer); }
  }

  public async connectAndDetect(port: SerialPort, baudRate = 115200, onDeviceLost?: () => void): Promise<ChipInfo> {
    if (this.transport) await this.disconnect();
    this.deviceLostCallback = onDeviceLost || null;
    const terminal: IEspLoaderTerminal = {
      clean: () => {},
      writeLine: (data: string) => { if (data.trim()) logService.addLog(data.trim(), 'flasher'); },
      write: (data: string) => { if (data.trim()) logService.addLog(data.trim(), 'flasher'); },
    };
    this.transport = new Transport(port, false);
    this.transport.setDeviceLostCallback(() => {
      logService.addLog('CRITICAL: USB device disconnect detected by flasher transport!', 'error');
      this.isConnected = false;
      this.deviceLostCallback?.();
    });
    this.esploader = new ESPLoader({ transport: this.transport, baudrate: baudRate, terminal });

    let chipName = '';
    try {
      chipName = await this.withTimeoutAndCleanup(() => this.esploader!.main('default_reset'), 15000, 'ROM bootloader synchronization (default reset)', async () => { await this.disconnect(); });
    } catch (firstErr) {
      logService.addLog(`Default reset sync notice: ${firstErr}. Attempting direct connection ('no_reset')...`, 'flasher');
      try {
        chipName = await this.withTimeoutAndCleanup(() => this.esploader!.main('no_reset'), 15000, 'ROM bootloader synchronization (no_reset)', async () => { await this.disconnect(); });
      } catch (secondErr) {
        await this.disconnect();
        throw new Error(`Failed to synchronize with ESP32-S3 ROM bootloader. ${secondErr}. Ensure board is in bootloader mode.`);
      }
    }

    this.isConnected = true;
    this.detectedChipName = chipName || 'ESP32-S3';
    logService.addLog(`ROM bootloader synchronized successfully. Detected chip: ${this.detectedChipName}`, 'flasher');

    let macAddress = 'Unknown';
    try {
      if (this.esploader.chip && typeof this.esploader.chip.readMac === 'function') {
        const mac = await this.esploader.chip.readMac(this.esploader);
        if (mac) macAddress = mac;
      }
    } catch { logService.addLog('Notice: MAC address could not be read.', 'flasher'); }

    let flashId: string | undefined;
    let flashSize: string | undefined;
    try {
      const rawFlashId = await this.esploader.readFlashId();
      if (rawFlashId !== undefined) {
        flashId = `0x${rawFlashId.toString(16).toUpperCase()}`;
        const lowByte = (rawFlashId >> 16) & 0xff;
        const detected = this.esploader.DETECTED_FLASH_SIZES[lowByte];
        if (detected) {
          flashSize = `detected:${detected}`;
          logService.addLog(`Detected SPI Flash Size: ${detected}`, 'flasher');
        }
      }
    } catch { logService.addLog('Notice: SPI Flash ID could not be queried. Flash capacity remains UNKNOWN.', 'flasher'); }

    return { chipName: this.detectedChipName, macAddress, description: this.detectedChipName, flashSize, flashId };
  }

  public async eraseChip(): Promise<void> {
    if (!this.esploader) throw new Error('No active bootloader connection. Connect the device first.');
    await this.withTimeoutAndCleanup(() => this.esploader!.eraseFlash(), 45000, 'Full chip erase', async () => { await this.disconnect(); });
    logService.addLog('Full chip erase completed successfully.', 'flasher');
  }
  public async eraseFlash(): Promise<void> { return this.eraseChip(); }

  public async flashImages(binaries: FirmwareBinary[], config: FlashConfig, onProgress: FlashProgressCallback, onSegmentVerified?: (fileName: string, hash: string) => void): Promise<void> {
    if (!this.esploader) throw new Error('No active bootloader connection.');
    const fileArray = binaries.map((bin) => ({ data: bin.data, address: bin.offsetNum }));
    const isEsp32S3 = this.detectedChipName.toUpperCase().includes('ESP32-S3');
    const effectiveCompression = isEsp32S3 ? false : config.compress;
    if (isEsp32S3 && config.compress) logService.addLog('ESP32-S3 safety policy: disabling compressed write path for esptool-js 0.6.1 due known S3 compressed-write reliability issues.', 'system');

    const flashOptions: FlashOptions = {
      fileArray,
      flashMode: config.flashMode as FlashModeValues,
      flashFreq: config.flashFreq as FlashFreqValues,
      flashSize: config.flashSize as FlashSizeValues,
      eraseAll: config.eraseAll,
      compress: effectiveCompression,
      reportProgress: (fileIndex: number, written: number, total: number) => onProgress(fileIndex, written, total, binaries[fileIndex]?.fileName || `Segment ${fileIndex + 1}`),
      calculateMD5Hash: (image: Uint8Array) => computeMD5(image),
    };

    const totalBytes = binaries.reduce((acc, f) => acc + f.size, 0);
    const timeoutMs = Math.max(60000, Math.round((totalBytes / 1024) * 200));
    await this.withTimeoutAndCleanup(() => this.esploader!.writeFlash(flashOptions), timeoutMs, 'Firmware write', async () => { await this.disconnect(); });

    // writeFlash resolves only after esptool-js completes its SPI_FLASH_MD5 post-write verification.
    for (const bin of binaries) onSegmentVerified?.(bin.fileName, bin.md5);
    logService.addLog('Firmware write completed and esptool-js post-write SPI flash MD5 verification succeeded.', 'flasher');
  }

  public async resetDevice(): Promise<void> {
    if (!this.esploader) return;
    try {
      await this.withTimeoutAndCleanup(() => this.esploader!.after('hard_reset'), 5000, 'Hardware reset');
      logService.addLog('Reset signal delivered. Board is restarting.', 'flasher');
    } catch (err) { logService.addLog(`Notice: Reset signal attempted (${err}).`, 'flasher'); }
  }

  public async disconnect(): Promise<void> {
    this.isConnected = false;
    this.detectedChipName = '';
    if (this.transport) {
      try {
        this.transport.setDeviceLostCallback(null);
        await this.withTimeoutAndCleanup(() => this.transport!.disconnect(), 3000, 'Transport disconnect');
      } catch { /* best-effort teardown */ }
      this.transport = null;
    }
    this.esploader = null;
    logService.addLog('ESP32 bootloader flasher transport disconnected.', 'flasher');
  }
}

export const esp32Service = new ESP32Service();
