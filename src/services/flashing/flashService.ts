import type { DeviceState, StateDetails } from '../../types/state';
import type { ChipInfo, FlashConfig, FlashProgress } from '../../types/esp32';
import type { FirmwarePackage } from '../../types/firmware';
import { esp32Service } from '../esp32/esp32Service';
import { logService } from '../logger/logService';

type StateListener = (details: StateDetails) => void;
type ProgressListener = (progress: FlashProgress) => void;

export class FlashService {
  private currentState: DeviceState = 'DISCONNECTED';
  private stateMessage = 'Ready to connect.';
  private stateError?: string;
  private troubleshootingSteps: string[] = [];
  private activePort: SerialPort | null = null;
  private detectedChip: ChipInfo | null = null;

  private stateListeners: Set<StateListener> = new Set();
  private progressListeners: Set<ProgressListener> = new Set();

  private progress: FlashProgress = {
    stage: 'idle',
    stageText: 'Idle',
    fileIndex: 0,
    totalFiles: 0,
    currentFileName: '',
    writtenBytes: 0,
    totalBytes: 0,
    percentage: 0,
    elapsedSeconds: 0,
    speedKbps: 0,
  };

  public get state(): DeviceState {
    return this.currentState;
  }

  public get chip(): ChipInfo | null {
    return this.detectedChip;
  }

  public get currentProgress(): FlashProgress {
    return { ...this.progress };
  }

  public subscribeState(listener: StateListener): () => void {
    this.stateListeners.add(listener);
    listener(this.getStateDetails());
    return () => this.stateListeners.delete(listener);
  }

  public subscribeProgress(listener: ProgressListener): () => void {
    this.progressListeners.add(listener);
    listener(this.currentProgress);
    return () => this.progressListeners.delete(listener);
  }

  public getStateDetails(): StateDetails {
    return {
      state: this.currentState,
      message: this.stateMessage,
      error: this.stateError,
      troubleshooting: this.troubleshootingSteps,
    };
  }

  private setState(
    newState: DeviceState,
    message: string,
    error?: string,
    troubleshooting: string[] = []
  ): void {
    this.currentState = newState;
    this.stateMessage = message;
    this.stateError = error;
    this.troubleshootingSteps = troubleshooting;

    const details = this.getStateDetails();
    this.stateListeners.forEach((fn) => fn(details));
  }

  private updateProgress(updates: Partial<FlashProgress>): void {
    this.progress = { ...this.progress, ...updates };
    this.progressListeners.forEach((fn) => fn({ ...this.progress }));
  }

  /**
   * Connects to the device port and checks ESP32-S3 bootloader state.
   */
  public async connectDevice(port: SerialPort): Promise<ChipInfo> {
    this.activePort = port;
    this.setState('CONNECTING', 'Establishing connection to serial port...');

    try {
      this.setState('CONNECTED', 'Port opened. Detecting ESP32-S3 ROM bootloader...');
      this.setState('DETECTING', 'Sending sync frames to ROM bootloader...');

      const chip = await esp32Service.connectAndDetect(port);
      this.detectedChip = chip;

      // Validate chip model
      if (!chip.chipName.toUpperCase().includes('ESP32-S3')) {
        logService.addLog(
          `Warning: Expected ESP32-S3, but detected "${chip.chipName}".`,
          'flasher'
        );
      }

      this.setState(
        'BOOTLOADER_READY',
        `${chip.chipName} detected & synchronized. Bootloader ready.`
      );
      return chip;
    } catch (err: unknown) {
      const error = err as Error;
      this.setState(
        'ERROR',
        'Failed to synchronize with ESP32-S3 bootloader.',
        error.message || String(error),
        [
          'Verify the USB-C cable is fully inserted and supports data transfer (not a charge-only cable).',
          'Put the XIAO ESP32S3 into bootloader mode manually:',
          '1. Press and HOLD the "B" (Boot) button.',
          '2. Briefly click the "R" (Reset) button (or insert USB while holding "B").',
          '3. Release the "B" button.',
          'Click "Connect ESP32" again and select the serial port.',
        ]
      );
      throw error;
    }
  }

  /**
   * Erases flash memory on the device.
   */
  public async eraseFlash(): Promise<void> {
    if (this.currentState !== 'BOOTLOADER_READY' && this.currentState !== 'FLASH_COMPLETE') {
      throw new Error('Device must be connected and in BOOTLOADER_READY state to erase.');
    }

    this.setState('FLASHING', 'Erasing entire flash memory...');
    this.updateProgress({
      stage: 'erasing',
      stageText: 'Erasing entire flash memory (please wait)...',
      percentage: 20,
    });

    try {
      await esp32Service.eraseFlash();
      this.updateProgress({
        stage: 'complete',
        stageText: 'Flash erase complete.',
        percentage: 100,
      });
      this.setState('BOOTLOADER_READY', 'Flash memory erased successfully.');
    } catch (err: unknown) {
      const error = err as Error;
      this.setState(
        'ERROR',
        'Flash erase operation failed.',
        error.message || String(error),
        ['Ensure the USB cable is securely connected.', 'Re-enter bootloader mode and retry.']
      );
      throw error;
    }
  }

  /**
   * Flashes firmware package to the device.
   */
  public async flashPackage(
    pkg: FirmwarePackage,
    config: FlashConfig
  ): Promise<void> {
    if (!this.activePort || this.currentState !== 'BOOTLOADER_READY') {
      throw new Error('Device must be connected and ready in bootloader mode before flashing.');
    }

    if (pkg.files.length === 0) {
      throw new Error('No firmware files specified in the selected package.');
    }

    const totalPayloadBytes = pkg.files.reduce((acc, f) => acc + f.size, 0);
    const startTime = Date.now();
    let accumulatedBytes = 0;

    this.setState('FLASHING', `Writing ${pkg.name} (${pkg.files.length} segments)...`);
    this.updateProgress({
      stage: 'preparing',
      stageText: 'Preparing flash payload...',
      fileIndex: 0,
      totalFiles: pkg.files.length,
      currentFileName: pkg.files[0].fileName,
      writtenBytes: 0,
      totalBytes: totalPayloadBytes,
      percentage: 0,
      elapsedSeconds: 0,
      speedKbps: 0,
    });

    try {
      if (config.eraseAll) {
        this.updateProgress({
          stage: 'erasing',
          stageText: 'Erasing flash memory before writing...',
          percentage: 5,
        });
      }

      await esp32Service.flashImages(
        pkg.files,
        config,
        (fileIdx, writtenInFile, totalInFile, fileName) => {
          const now = Date.now();
          const elapsedSecs = Math.max(0.1, (now - startTime) / 1000);

          // Calculate aggregate progress
          const prevFilesBytes = pkg.files
            .slice(0, fileIdx)
            .reduce((acc, f) => acc + f.size, 0);
          accumulatedBytes = prevFilesBytes + writtenInFile;

          const pct = Math.min(99, Math.round((accumulatedBytes / totalPayloadBytes) * 100));
          const speed = Math.round((accumulatedBytes / 1024) / elapsedSecs);

          this.updateProgress({
            stage: 'writing',
            stageText: `Writing ${fileName} (${writtenInFile} / ${totalInFile} bytes)...`,
            fileIndex: fileIdx + 1,
            totalFiles: pkg.files.length,
            currentFileName: fileName,
            writtenBytes: accumulatedBytes,
            totalBytes: totalPayloadBytes,
            percentage: pct,
            elapsedSeconds: elapsedSecs,
            speedKbps: speed,
          });
        }
      );

      this.setState('VERIFYING', 'Verifying on-chip MD5 checksums...');
      this.updateProgress({
        stage: 'verifying',
        stageText: 'Validating on-chip MD5 checksums with ESP32-S3 ROM...',
        percentage: 99,
      });

      const totalTime = (Date.now() - startTime) / 1000;
      const finalSpeed = Math.round((totalPayloadBytes / 1024) / Math.max(0.1, totalTime));

      this.updateProgress({
        stage: 'complete',
        stageText: 'Flashing and verification complete!',
        percentage: 100,
        writtenBytes: totalPayloadBytes,
        elapsedSeconds: totalTime,
        speedKbps: finalSpeed,
      });

      this.setState('FLASH_COMPLETE', `Successfully flashed ${pkg.name}!`);
      logService.addLog(
        `SUCCESS: Wrote ${totalPayloadBytes} bytes in ${totalTime.toFixed(1)}s (${finalSpeed} KB/s). Device reset into execution mode.`,
        'flasher'
      );
    } catch (err: unknown) {
      const error = err as Error;
      this.updateProgress({
        stage: 'failed',
        stageText: `Flashing failed: ${error.message}`,
      });

      this.setState(
        'ERROR',
        'Firmware flashing failed.',
        error.message || String(error),
        [
          'The USB connection may have dropped or stalled during transfer.',
          'Verify your USB cable and port stability.',
          'Try using DIO mode instead of QIO mode (DIO is standard for Seeed XIAO ESP32S3).',
          'Put board into bootloader mode (Hold BOOT, click RESET, release BOOT) and retry.',
        ]
      );
      throw error;
    }
  }

  /**
   * Resets the connected device.
   */
  public async resetDevice(): Promise<void> {
    await esp32Service.resetDevice();
  }

  /**
   * Disconnects the flashing service and resets state.
   */
  public async disconnect(): Promise<void> {
    await esp32Service.disconnect();
    this.activePort = null;
    this.detectedChip = null;
    this.setState('DISCONNECTED', 'Device disconnected.');
    this.updateProgress({
      stage: 'idle',
      stageText: 'Idle',
      percentage: 0,
      writtenBytes: 0,
      totalBytes: 0,
      speedKbps: 0,
    });
  }
}

export const flashService = new FlashService();
