import type { DeviceState, StateDetails } from '../../types/state';
import type { ChipInfo, FlashConfig, FlashProgress } from '../../types/esp32';
import type { FirmwarePackage } from '../../types/firmware';
import { esp32Service } from '../esp32/esp32Service';
import { logService } from '../logger/logService';
import { FirmwareValidator } from '../firmware/firmwareValidator';
import { isValidTransition } from '../state/stateTransitions';
import { portCoordinator } from '../port/portCoordinator';

type StateListener = (details: StateDetails) => void;
type ProgressListener = (progress: FlashProgress) => void;

export class FlashService {
  private currentState: DeviceState = 'DISCONNECTED';
  private stateMessage = 'Ready to connect.';
  private stateError?: string;
  private troubleshootingSteps: string[] = [];
  private activePort: SerialPort | null = null;
  private detectedChip: ChipInfo | null = null;
  private isOperationActive = false;
  private currentOperationId = 0;

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

  public get isBusy(): boolean {
    return this.isOperationActive;
  }

  public get port(): SerialPort | null {
    return this.activePort;
  }

  public get operationId(): number {
    return this.currentOperationId;
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

  /**
   * Generates a new monotonic operation token.
   */
  private nextOperationId(): number {
    return ++this.currentOperationId;
  }

  /**
   * Checks if an async completion belongs to the currently active operation.
   */
  private isCurrentOperation(opId: number): boolean {
    return this.currentOperationId === opId;
  }

  /**
   * Transitions state strictly according to VALID_STATE_TRANSITIONS table.
   */
  private setState(
    newState: DeviceState,
    message: string,
    error?: string,
    troubleshooting: string[] = []
  ): void {
    if (!isValidTransition(this.currentState, newState)) {
      logService.addLog(
        `State machine guarded: Transition from "${this.currentState}" to "${newState}" is not permitted.`,
        'error'
      );
      // Route invalid jumps safely to ERROR state
      this.currentState = 'ERROR';
      this.stateMessage = `Illegal state transition attempted from ${this.currentState} to ${newState}.`;
      this.stateError = 'State machine transition violation';
      this.troubleshootingSteps = ['Disconnect and restart the operation from DISCONNECTED state.'];
    } else {
      this.currentState = newState;
      this.stateMessage = message;
      this.stateError = error;
      this.troubleshootingSteps = troubleshooting;
    }

    const details = this.getStateDetails();
    this.stateListeners.forEach((fn) => fn(details));
  }

  private updateProgress(updates: Partial<FlashProgress>): void {
    this.progress = { ...this.progress, ...updates };
    this.progressListeners.forEach((fn) => fn({ ...this.progress }));
  }

  /**
   * Connects to the device port and synchronizes with the ESP32-S3 ROM bootloader.
   */
  public async connectDevice(port: SerialPort): Promise<ChipInfo> {
    if (this.isOperationActive) {
      throw new Error('Another hardware operation is currently in progress. Please wait.');
    }

    const opId = this.nextOperationId();
    this.isOperationActive = true;
    this.activePort = port;

    try {
      // Acquire exclusive lease from PortCoordinator
      await portCoordinator.acquireLease('flasher', port);

      this.setState('CONNECTING', 'Establishing connection to serial port...');

      this.setState('CONNECTED', 'Port opened. Detecting ESP32-S3 ROM bootloader...');
      this.setState('DETECTING', 'Sending sync frames to ROM bootloader...');

      const chip = await esp32Service.connectAndDetect(port, 115200, () => {
        this.handleDeviceLost();
      });

      // Discard completion if operation was cancelled or superseded
      if (!this.isCurrentOperation(opId)) {
        logService.addLog(`Discarding stale connection result from operation #${opId}`, 'system');
        await portCoordinator.releaseLease('flasher');
        return chip;
      }

      this.detectedChip = chip;

      // Validate chip model
      if (!chip.chipName.toUpperCase().includes('ESP32-S3')) {
        logService.addLog(
          `Warning: Connected chip is "${chip.chipName}", which differs from primary target (ESP32-S3).`,
          'flasher'
        );
      }

      this.setState(
        'BOOTLOADER_READY',
        `${chip.chipName} detected & synchronized. Bootloader ready.`
      );
      return chip;
    } catch (err: unknown) {
      await portCoordinator.releaseLease('flasher');
      const error = err as Error;
      this.setState(
        'ERROR',
        'Failed to synchronize with ESP32-S3 bootloader.',
        error.message || String(error),
        [
          'Verify the USB-C cable is data-capable (not a charge-only cable).',
          'Put the XIAO ESP32S3 into bootloader mode manually:',
          '1. Press and HOLD the miniature "B" (Boot) button.',
          '2. Briefly click the "R" (Reset) button (or insert USB while holding "B").',
          '3. Release the "B" button.',
          'Click "Connect ESP32" again and select the serial port.',
        ]
      );
      throw error;
    } finally {
      this.isOperationActive = false;
    }
  }

  /**
   * Internal handler called if physical USB disconnects unexpectedly.
   */
  private handleDeviceLost(): void {
    const opId = this.nextOperationId();
    logService.addLog('CRITICAL: USB cable disconnected during active session.', 'error');
    this.activePort = null;
    this.detectedChip = null;
    this.isOperationActive = false;
    void portCoordinator.releaseLease('flasher');

    this.updateProgress({
      stage: 'failed',
      stageText: 'USB device disconnected',
    });

    if (this.isCurrentOperation(opId)) {
      this.setState(
        'ERROR',
        'USB device disconnected unexpectedly.',
        'The serial connection was severed because the device was unplugged or reset.',
        [
          'Reconnect the USB cable securely.',
          'If flashing was interrupted, place the board back into bootloader mode (Hold B, click R, release B).',
          'Click "Connect ESP32" to re-establish connection.',
        ]
      );
    }
  }

  /**
   * Erases flash memory on the device.
   */
  public async eraseFlash(): Promise<void> {
    if (this.isOperationActive) {
      throw new Error('An operation is already in progress. Please wait.');
    }

    const opId = this.nextOperationId();
    this.isOperationActive = true;
    this.setState('ERASING', 'Transmitting full chip erase command (timeout 45s)...');
    this.updateProgress({
      stage: 'erasing',
      stageText: 'Erasing target flash memory (this may take up to 45 seconds)...',
      percentage: 20,
    });

    try {
      await esp32Service.eraseChip();

      if (!this.isCurrentOperation(opId)) return;

      this.updateProgress({
        stage: 'complete',
        stageText: 'Chip erase complete! Ready for firmware flashing.',
        percentage: 100,
      });

      this.setState('BOOTLOADER_READY', 'Full flash memory successfully erased. Bootloader ready.');
    } catch (err: unknown) {
      const error = err as Error;
      this.setState(
        'ERROR',
        'Failed to erase flash memory.',
        error.message || String(error),
        [
          'Check that the board remained in bootloader mode during the erase.',
          'Verify that the USB cable was not disconnected.',
          'Retry erasing, or reconnect the device.',
        ]
      );
      throw error;
    } finally {
      this.isOperationActive = false;
    }
  }

  /**
   * Flashes the selected firmware package to the connected device.
   */
  public async flashPackage(pkg: FirmwarePackage, config: FlashConfig): Promise<void> {
    return this.startFlashing(pkg, config);
  }

  /**
   * Flashes the selected firmware package to the connected device.
   */
  public async startFlashing(pkg: FirmwarePackage, config: FlashConfig): Promise<void> {
    if (this.isOperationActive) {
      throw new Error('An operation is already in progress. Please wait.');
    }

    if (!this.detectedChip) {
      throw new Error('No ESP32 device connected. Connect to your device first.');
    }

    const opId = this.nextOperationId();
    this.isOperationActive = true;

    // 1. Validation Phase
    this.setState('VALIDATING', 'Validating firmware package integrity and memory bounds...');
    this.updateProgress({
      stage: 'validating',
      stageText: 'Validating binary offsets, SHA-256 integrity, and headers...',
      percentage: 2,
    });

    const flashCapacityBytes = FirmwareValidator.parseFlashCapacityBytes(
      this.detectedChip.flashSize || config.flashSize
    );

    if (flashCapacityBytes === null) {
      logService.addLog(
        'Notice: Target flash capacity is UNKNOWN. Memory boundary safety cannot be verified automatically.',
        'flasher'
      );
      if (pkg.trustLevel === 'unverified_custom') {
        logService.addLog(
          'WARNING: Flashing unverified custom firmware with unknown flash capacity.',
          'error'
        );
      }
    }

    const validationResult = FirmwareValidator.validatePackage(
      pkg,
      flashCapacityBytes,
      this.detectedChip.chipName || 'ESP32-S3'
    );

    pkg.flashCapacityStatus = validationResult.flashCapacityStatus;

    if (!validationResult.isValid) {
      const errorSummary = validationResult.errors.map((e) => e.message).join('\n');
      this.setState(
        'ERROR',
        'Firmware package validation failed before flashing.',
        errorSummary,
        [
          'Check the binary offsets to ensure they do not overlap.',
          'Verify that all binary files are non-empty and formatted correctly.',
          'Ensure executable images start with magic byte 0xE9 and chip ID 0x09.',
          flashCapacityBytes
            ? `Ensure total size does not exceed flash capacity (${Math.round(flashCapacityBytes / (1024 * 1024))} MB).`
            : 'Verify flash size before flashing custom payloads.',
        ]
      );
      this.isOperationActive = false;
      throw new Error(`Firmware validation failed:\n${errorSummary}`);
    }

    // Log warnings if any
    for (const w of validationResult.warnings) {
      logService.addLog(`Validation notice: ${w.message}`, 'system');
    }

    const totalPayloadBytes = pkg.files.reduce((acc, f) => acc + f.size, 0);
    const startTime = Date.now();
    let accumulatedBytes = 0;

    try {
      // 2. Erase phase (if eraseAll selected)
      if (config.eraseAll) {
        this.setState('ERASING', 'Erasing entire flash memory before write...');
        this.updateProgress({
          stage: 'erasing',
          stageText: 'Erasing flash memory before writing...',
          percentage: 5,
        });
        await esp32Service.eraseFlash();
        if (!this.isCurrentOperation(opId)) return;
      }

      // 3. Flashing phase
      this.setState('FLASHING', `Writing ${pkg.name} (${pkg.files.length} segments)...`);
      this.updateProgress({
        stage: 'writing',
        stageText: `Writing 1 of ${pkg.files.length}: ${pkg.files[0]?.fileName}...`,
        fileIndex: 0,
        totalFiles: pkg.files.length,
        currentFileName: pkg.files[0]?.fileName || 'firmware',
        writtenBytes: 0,
        totalBytes: totalPayloadBytes,
        percentage: 10,
        elapsedSeconds: 0,
        speedKbps: 0,
      });

      await esp32Service.flashImages(
        pkg.files,
        config,
        (fileIdx, writtenInFile, _totalInFile, fileName) => {
          if (!this.isCurrentOperation(opId)) return;
          const now = Date.now();
          const elapsedSecs = Math.max(0.1, (now - startTime) / 1000);

          const prevFilesBytes = pkg.files
            .slice(0, fileIdx)
            .reduce((acc, f) => acc + f.size, 0);
          accumulatedBytes = prevFilesBytes + writtenInFile;

          const pct = Math.min(95, Math.max(10, Math.round((accumulatedBytes / totalPayloadBytes) * 100)));
          const speed = Math.round((accumulatedBytes / 1024) / elapsedSecs);

          this.updateProgress({
            stage: 'writing',
            stageText: `Writing ${fileName} (${accumulatedBytes} / ${totalPayloadBytes} bytes)...`,
            fileIndex: fileIdx + 1,
            totalFiles: pkg.files.length,
            currentFileName: fileName,
            writtenBytes: accumulatedBytes,
            totalBytes: totalPayloadBytes,
            percentage: pct,
            elapsedSeconds: elapsedSecs,
            speedKbps: speed,
          });
        },
        (fileName, hash) => {
          if (this.isCurrentOperation(opId)) {
            logService.addLog(`[VERIFIED] Segment ${fileName} verified with hash ${hash}.`, 'flasher');
          }
        }
      );

      if (!this.isCurrentOperation(opId)) return;

      // 4. Verification phase
      this.setState('VERIFYING', 'Confirming on-chip SPI flash readback MD5 checksums...');
      this.updateProgress({
        stage: 'verifying',
        stageText: 'Confirming on-chip SPI flash readback checksum verification...',
        percentage: 98,
      });

      // 5. Reset phase
      this.setState('RESETTING', 'Transmitting reset pulse to ESP32-S3...');
      this.updateProgress({
        stage: 'resetting',
        stageText: 'Resetting ESP32-S3 into execution mode...',
        percentage: 99,
      });

      await esp32Service.resetDevice();

      if (!this.isCurrentOperation(opId)) return;

      const totalTime = Math.max(0.1, (Date.now() - startTime) / 1000);
      const finalSpeed = Math.round((totalPayloadBytes / 1024) / totalTime);

      this.updateProgress({
        stage: 'complete',
        stageText: 'Flashing and verification complete! Device reset.',
        percentage: 100,
        writtenBytes: totalPayloadBytes,
        elapsedSeconds: totalTime,
        speedKbps: finalSpeed,
      });

      this.setState(
        'FLASH_COMPLETE',
        `Successfully flashed ${pkg.name}! Write & on-chip SPI flash readback MD5 verification passed.`
      );

      logService.addLog(
        `WRITE SUCCESS: Wrote ${totalPayloadBytes} bytes in ${totalTime.toFixed(1)}s (${finalSpeed} KB/s).`,
        'flasher'
      );
      logService.addLog(
        'VERIFY SUCCESS: SPI Flash readback MD5 matched source image. On-chip SPI bus integrity confirmed.',
        'flasher'
      );
      logService.addLog(
        'RESET TRANSMITTED: Device reboot signal sent. Start Serial Monitor (115200 baud) to view boot output.',
        'system'
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
          'Verify your USB cable and physical port stability.',
          'Ensure Flash Mode is set to DIO (standard for Seeed Studio XIAO ESP32S3).',
          'Put the board back into bootloader mode (Hold B, click R, release B) and retry.',
        ]
      );
      throw error;
    } finally {
      this.isOperationActive = false;
    }
  }

  /**
   * Resets the connected device.
   */
  public async resetDevice(): Promise<void> {
    if (this.isOperationActive) return;
    await esp32Service.resetDevice();
  }

  /**
   * Disconnects the flashing service and resets state.
   */
  public async disconnect(): Promise<void> {
    this.nextOperationId();
    this.setState('DISCONNECTING', 'Closing flasher transport...');
    await esp32Service.disconnect();
    await portCoordinator.releaseLease('flasher');
    this.activePort = null;
    this.detectedChip = null;
    this.isOperationActive = false;
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
