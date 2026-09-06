/**
 * Device connection and operational state machine.
 * Deterministic states covering the complete lifecycle from connection
 * through validation, erasure, flashing, verification, reset, and teardown.
 */
export type DeviceState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DETECTING'
  | 'BOOTLOADER_READY'
  | 'VALIDATING'
  | 'ERASING'
  | 'FLASHING'
  | 'VERIFYING'
  | 'RESETTING'
  | 'FLASH_COMPLETE'
  | 'ERROR'
  | 'DISCONNECTING';

export interface StateDetails {
  state: DeviceState;
  message: string;
  error?: string;
  troubleshooting?: string[];
}
