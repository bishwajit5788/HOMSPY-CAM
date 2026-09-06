import type { DeviceState, StateDetails } from '../../types/state';
import type { ChipInfo, FlashConfig, FlashProgress } from '../../types/esp32';
import type { FirmwarePackage } from '../../types/firmware';
import { esp32Service } from '../esp32/esp32Service';
import { logService } from '../logger/logService';
import { FirmwareValidator } from '../firmware/firmwareValidator';
import { isValidTransition } from '../state/stateTransitions';
import { portCoordinator } from '../port/portCoordinator';
import { flashRecoveryService } from '../recovery/flashRecoveryService';
import { firmwareRollbackService } from '../firmware/firmwareRollbackService';

type StateListener = (details: StateDetails) => void;
type ProgressListener = (progress: FlashProgress) => void;

export class FlashService {
  private currentState: DeviceState = 'DISCONNECTED';
  private stateMessage = 'Ready to connect.';
  private stateError?: string;
  private troubleshootingSteps: string[] = [];
  private activePort: SerialPort | null = null;
  private lastKnownPort: SerialPort | null = null;
  private detectedChip: ChipInfo | null = null;
  private isOperationActive = false;
  private currentOperationId = 0;
  private stateListeners = new Set<StateListener>();
  private progressListeners = new Set<ProgressListener>();
  private progress: FlashProgress = { stage: 'idle', stageText: 'Idle', fileIndex: 0, totalFiles: 0, currentFileName: '', writtenBytes: 0, totalBytes: 0, percentage: 0, elapsedSeconds: 0, speedKbps: 0 };

  public get state(): DeviceState { return this.currentState; }
  public get chip(): ChipInfo | null { return this.detectedChip; }
  public get currentProgress(): FlashProgress { return { ...this.progress }; }
  public get isBusy(): boolean { return this.isOperationActive; }
  public get port(): SerialPort | null { return this.activePort; }
  public get operationId(): number { return this.currentOperationId; }
  public get recoveryRecord() { return flashRecoveryService.get(); }
  public subscribeState(listener: StateListener): () => void { this.stateListeners.add(listener); listener(this.getStateDetails()); return () => this.stateListeners.delete(listener); }
  public subscribeProgress(listener: ProgressListener): () => void { this.progressListeners.add(listener); listener(this.currentProgress); return () => this.progressListeners.delete(listener); }
  public getStateDetails(): StateDetails { return { state: this.currentState, message: this.stateMessage, error: this.stateError, troubleshooting: this.troubleshootingSteps }; }

  private nextOperationId(): number { return ++this.currentOperationId; }
  private isCurrentOperation(opId: number): boolean { return this.currentOperationId === opId; }
  private invalidateCurrentOperation(): void { this.currentOperationId++; }

  private setState(newState: DeviceState, message: string, error?: string, troubleshooting: string[] = []): void {
    if (!isValidTransition(this.currentState, newState)) {
      const from = this.currentState;
      this.currentState = 'ERROR'; this.stateMessage = `Illegal state transition attempted from ${from} to ${newState}.`; this.stateError = 'State machine transition violation'; this.troubleshootingSteps = ['Disconnect and restart the operation from DISCONNECTED state.'];
      logService.addLog(`State machine guarded: ${from} -> ${newState} is not permitted.`, 'error', { event: 'state.transition.blocked' });
    } else { this.currentState = newState; this.stateMessage = message; this.stateError = error; this.troubleshootingSteps = troubleshooting; }
    const details = this.getStateDetails(); this.stateListeners.forEach((fn) => fn(details));
  }

  private updateProgress(updates: Partial<FlashProgress>): void { this.progress = { ...this.progress, ...updates }; this.progressListeners.forEach((fn) => fn({ ...this.progress })); }

  public async connectDevice(port: SerialPort): Promise<ChipInfo> {
    if (this.isOperationActive) throw new Error('Another hardware operation is currently in progress. Please wait.');
    const opId = this.nextOperationId(); this.isOperationActive = true; this.activePort = port; this.lastKnownPort = port;
    try {
      await portCoordinator.acquireLease('flasher', port);
      if (!this.isCurrentOperation(opId)) throw new Error('Connection operation was superseded.');
      this.setState('CONNECTING', 'Establishing connection to serial port...'); this.setState('CONNECTED', 'Port opened. Detecting ESP32-S3 ROM bootloader...'); this.setState('DETECTING', 'Sending sync frames to ROM bootloader...');
      const chip = await esp32Service.connectAndDetect(port, 115200, () => this.handleDeviceLost());
      if (!this.isCurrentOperation(opId)) throw new Error('Connection result was discarded because the operation is stale.');
      this.detectedChip = chip;
      if (!chip.chipName.toUpperCase().includes('ESP32-S3')) logService.addLog(`Warning: Connected chip is "${chip.chipName}", primary target is ESP32-S3.`, 'flasher', { event: 'device.chip_mismatch', metadata: { chip: chip.chipName } });
      if (!chip.flashSize) logService.addLog('WARNING: Physical flash capacity could not be detected. Flashing is blocked until it is known.', 'error', { event: 'flash.capacity.unknown' });
      const recovery = flashRecoveryService.get();
      if (recovery?.interrupted) logService.addLog(`RECOVERY AVAILABLE: interrupted ${recovery.phase} operation for ${recovery.packageName} ${recovery.version}. A matching package will restart from a clean erase.`, 'hardware', { event: 'recovery.available' });
      this.setState('BOOTLOADER_READY', `${chip.chipName} detected & synchronized. Bootloader ready.`); return chip;
    } catch (err: unknown) {
      if (this.isCurrentOperation(opId)) this.setState('ERROR', 'Failed to synchronize with ESP32-S3 bootloader.', err instanceof Error ? err.message : String(err), ['Verify the USB cable is data-capable.', 'Place the XIAO ESP32S3 into bootloader mode and retry.', 'If the device recently reset, wait for the USB serial port to re-enumerate and reconnect.']);
      await portCoordinator.releaseLease('flasher'); throw err;
    } finally { if (this.isCurrentOperation(opId)) this.isOperationActive = false; }
  }

  public async retryLastConnection(): Promise<ChipInfo> {
    if (!this.lastKnownPort) throw new Error('No previously used serial port is available for automatic retry.');
    logService.addLog('Retrying the last known serial port after a hardware/USB failure.', 'hardware', { event: 'device.reconnect.retry' });
    return this.connectDevice(this.lastKnownPort);
  }

  private handleDeviceLost(): void {
    this.invalidateCurrentOperation(); this.isOperationActive = false; this.lastKnownPort = this.activePort; this.activePort = null; this.detectedChip = null; flashRecoveryService.markInterrupted(); void portCoordinator.releaseLease('flasher');
    this.updateProgress({ stage: 'failed', stageText: 'USB device disconnected' });
    this.setState('ERROR', 'USB device disconnected unexpectedly.', 'The serial connection was severed because the device was unplugged or reset.', ['Reconnect the USB cable securely.', 'Return the board to bootloader mode if flashing was interrupted.', 'Reconnect/retry; recovery state is retained so the matching package can be restarted safely.']);
  }

  public async eraseFlash(): Promise<void> {
    if (this.isOperationActive) throw new Error('An operation is already in progress. Please wait.');
    if (!this.detectedChip) throw new Error('No ESP32 device connected. Connect to your device first.');
    if (!this.detectedChip.flashSize) throw new Error('Physical flash capacity is unknown. Refusing destructive erase until hardware flash size is detected.');
    const opId = this.nextOperationId(); this.isOperationActive = true; this.setState('ERASING', 'Transmitting full chip erase command...'); this.updateProgress({ stage: 'erasing', stageText: 'Erasing target flash memory...', percentage: 20 });
    try { await esp32Service.eraseChip(); if (!this.isCurrentOperation(opId)) return; this.updateProgress({ stage: 'complete', stageText: 'Chip erase complete! Ready for firmware flashing.', percentage: 100 }); this.setState('BOOTLOADER_READY', 'Full flash memory successfully erased. Bootloader ready.'); }
    catch (err: unknown) { if (this.isCurrentOperation(opId)) this.setState('ERROR', 'Failed to erase flash memory.', err instanceof Error ? err.message : String(err)); throw err; }
    finally { if (this.isCurrentOperation(opId)) this.isOperationActive = false; }
  }

  public async flashPackage(pkg: FirmwarePackage, config: FlashConfig): Promise<void> { return this.startFlashing(pkg, config); }

  public async startFlashing(pkg: FirmwarePackage, config: FlashConfig): Promise<void> {
    if (this.isOperationActive) throw new Error('An operation is already in progress. Please wait.');
    if (!this.detectedChip) throw new Error('No ESP32 device connected. Connect to your device first.');
    const rollback = firmwareRollbackService.check(pkg); if (!rollback.allowed) throw new Error(rollback.reason);
    const opId = this.nextOperationId(); this.isOperationActive = true;
    this.setState('VALIDATING', 'Validating firmware integrity, authenticity, rollback policy, and hardware bounds...');
    this.updateProgress({ stage: 'validating', stageText: 'Validating checksums, release signature, rollback policy, image headers, and detected flash bounds...', percentage: 2 });
    const detectedCapacityBytes = FirmwareValidator.parseFlashCapacityBytes(this.detectedChip.flashSize);
    if (detectedCapacityBytes === null) { const message = 'Physical flash capacity is UNKNOWN. Flashing is blocked because memory boundary safety cannot be verified.'; this.setState('ERROR', 'Flashing blocked: flash capacity unknown.', message, ['Reconnect the board and ensure SPI flash ID detection succeeds.', 'Do not substitute the UI flash-size setting for detected hardware capacity.']); this.isOperationActive = false; throw new Error(message); }
    const validationResult = FirmwareValidator.validatePackage(pkg, detectedCapacityBytes, this.detectedChip.chipName || 'ESP32-S3'); pkg.flashCapacityStatus = validationResult.flashCapacityStatus;
    if (!validationResult.isValid || validationResult.flashCapacityStatus !== 'verified') { const errorSummary = validationResult.errors.map((e) => e.message).join('\n') || 'Flash capacity validation did not reach a verified state.'; this.setState('ERROR', 'Firmware package validation failed before flashing.', errorSummary, ['Verify the package checksums and executable headers.', 'Ensure all segments fit inside the detected physical flash capacity.']); this.isOperationActive = false; throw new Error(`Firmware validation failed:\n${errorSummary}`); }
    for (const warning of validationResult.warnings) logService.addLog(`Validation notice: ${warning.message}`, 'system', { event: 'firmware.validation.warning' });
    const recoveryMatch = flashRecoveryService.matches(pkg); if (recoveryMatch) { logService.addLog('SAFE RECOVERY: matching interrupted flash detected. Restarting from a clean full-chip erase instead of attempting an unsafe partial resume.', 'hardware', { event: 'recovery.restart_clean' }); config = { ...config, eraseAll: true }; }
    flashRecoveryService.begin(pkg, 'validating', config);
    const totalPayloadBytes = pkg.files.reduce((acc, f) => acc + f.size, 0); const startTime = Date.now();
    try {
      if (config.eraseAll) { flashRecoveryService.update(pkg, 'erasing', 0, 0); this.setState('ERASING', 'Erasing entire flash memory before write...'); this.updateProgress({ stage: 'erasing', stageText: 'Erasing flash memory before writing...', percentage: 5 }); await esp32Service.eraseFlash(); if (!this.isCurrentOperation(opId)) return; }
      flashRecoveryService.update(pkg, 'writing', 0, 0); this.setState('FLASHING', `Writing ${pkg.name} (${pkg.files.length} segments)...`); this.updateProgress({ stage: 'writing', stageText: `Writing ${pkg.files.length} segment(s)...`, totalFiles: pkg.files.length, totalBytes: totalPayloadBytes, percentage: 10 });
      const detectedFlashSize = this.detectedChip.flashSize?.replace(/^detected:/, '');
      await esp32Service.flashImages(pkg.files, { ...config, flashSize: (detectedFlashSize || config.flashSize) as FlashConfig['flashSize'] }, (fileIdx, written, _total, fileName) => {
        if (!this.isCurrentOperation(opId)) return; const elapsed = Math.max(0.1, (Date.now() - startTime) / 1000); const previous = pkg.files.slice(0, fileIdx).reduce((acc, f) => acc + f.size, 0); const accumulated = previous + written; flashRecoveryService.update(pkg, 'writing', fileIdx, accumulated); this.updateProgress({ stage: 'writing', stageText: `Writing ${fileName} (${accumulated} / ${totalPayloadBytes} bytes)...`, fileIndex: fileIdx + 1, totalFiles: pkg.files.length, currentFileName: fileName, writtenBytes: accumulated, totalBytes: totalPayloadBytes, percentage: Math.min(95, Math.max(10, Math.round((accumulated / totalPayloadBytes) * 100))), elapsedSeconds: elapsed, speedKbps: Math.round((accumulated / 1024) / elapsed) });
      }, (fileName, hash) => { if (this.isCurrentOperation(opId)) logService.addLog(`[VERIFIED] ${fileName}: esptool-js post-write MD5 verification succeeded (${hash}).`, 'flasher', { event: 'flash.segment.verified', operationId: opId }); });
      if (!this.isCurrentOperation(opId)) return;
      flashRecoveryService.update(pkg, 'verifying', pkg.files.length, totalPayloadBytes); this.setState('VERIFYING', 'On-chip SPI flash readback MD5 verification completed by esptool-js.'); this.updateProgress({ stage: 'verifying', stageText: 'SPI flash readback verification complete...', percentage: 98 });
      flashRecoveryService.update(pkg, 'resetting', pkg.files.length, totalPayloadBytes); this.setState('RESETTING', 'Transmitting reset pulse to ESP32-S3...'); this.updateProgress({ stage: 'resetting', stageText: 'Resetting ESP32-S3 into execution mode...', percentage: 99 }); await esp32Service.resetDevice(); if (!this.isCurrentOperation(opId)) return;
      firmwareRollbackService.recordSuccessfulFlash(pkg); flashRecoveryService.clear(); this.updateProgress({ stage: 'complete', stageText: 'Flashing and verification complete! Device reset.', percentage: 100, writtenBytes: totalPayloadBytes, totalBytes: totalPayloadBytes }); this.setState('FLASH_COMPLETE', 'Firmware flashed, readback-verified, and device reset successfully.');
    } catch (err: unknown) { flashRecoveryService.markInterrupted(); if (this.isCurrentOperation(opId)) this.setState('ERROR', 'Firmware flashing failed.', err instanceof Error ? err.message : String(err), ['Keep the board connected and in bootloader mode.', 'Reconnect and retry the same package; a matching interrupted operation will be recovered with a clean erase.', 'If the browser lost the device, re-enter bootloader mode before retrying.']); throw err; }
    finally { if (this.isCurrentOperation(opId)) this.isOperationActive = false; }
  }

  public async cancelActiveOperation(): Promise<void> { if (!this.isOperationActive) return; logService.addLog('CANCEL requested: invalidating the active operation and tearing down the serial transport.', 'hardware', { event: 'operation.cancel' }); this.invalidateCurrentOperation(); flashRecoveryService.markInterrupted(); await this.disconnect(); }

  public async disconnect(): Promise<void> { this.invalidateCurrentOperation(); this.isOperationActive = false; try { await esp32Service.disconnect(); } finally { await portCoordinator.releaseLease('flasher'); this.activePort = null; this.detectedChip = null; if (this.currentState !== 'DISCONNECTED') this.setState('DISCONNECTING', 'Disconnecting device...'); if (this.currentState !== 'DISCONNECTED') this.setState('DISCONNECTED', 'Ready to connect.'); } }
  public async resetDevice(): Promise<void> { await esp32Service.resetDevice(); }
}

export const flashService = new FlashService();
