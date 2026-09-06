/**
 * Device connection and operational state machine.
 */
export type DeviceState =
  | 'DISCONNECTED'
  | 'CONNECTING'
  | 'CONNECTED'
  | 'DETECTING'
  | 'BOOTLOADER_READY'
  | 'FLASHING'
  | 'VERIFYING'
  | 'FLASH_COMPLETE'
  | 'ERROR';

export interface StateDetails {
  state: DeviceState;
  message: string;
  error?: string;
  troubleshooting?: string[];
}
