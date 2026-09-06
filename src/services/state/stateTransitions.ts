import type { DeviceState } from '../../types/state';

/**
 * Formal state transition table enforcing valid forward and recovery paths.
 * Prevents impossible or invalid jumps (e.g. DISCONNECTED -> FLASHING).
 */
export const VALID_STATE_TRANSITIONS: Record<DeviceState, readonly DeviceState[]> = {
  DISCONNECTED: ['CONNECTING', 'ERROR', 'DISCONNECTING'],
  CONNECTING: ['CONNECTED', 'ERROR', 'DISCONNECTING', 'DISCONNECTED'],
  CONNECTED: ['DETECTING', 'BOOTLOADER_READY', 'ERROR', 'DISCONNECTING', 'DISCONNECTED'],
  DETECTING: ['BOOTLOADER_READY', 'CONNECTED', 'ERROR', 'DISCONNECTING', 'DISCONNECTED'],
  BOOTLOADER_READY: [
    'VALIDATING',
    'ERASING',
    'CONNECTING',
    'ERROR',
    'DISCONNECTING',
    'DISCONNECTED',
  ],
  VALIDATING: [
    'FLASHING',
    'ERASING',
    'BOOTLOADER_READY',
    'ERROR',
    'DISCONNECTING',
    'DISCONNECTED',
  ],
  ERASING: [
    'BOOTLOADER_READY',
    'VALIDATING',
    'FLASH_COMPLETE',
    'ERROR',
    'DISCONNECTING',
    'DISCONNECTED',
  ],
  FLASHING: ['VERIFYING', 'ERROR', 'DISCONNECTING', 'DISCONNECTED'],
  VERIFYING: [
    'RESETTING',
    'FLASH_COMPLETE',
    'ERROR',
    'DISCONNECTING',
    'DISCONNECTED',
  ],
  RESETTING: [
    'FLASH_COMPLETE',
    'BOOTLOADER_READY',
    'CONNECTED',
    'ERROR',
    'DISCONNECTING',
    'DISCONNECTED',
  ],
  FLASH_COMPLETE: [
    'BOOTLOADER_READY',
    'VALIDATING',
    'CONNECTING',
    'ERROR',
    'DISCONNECTING',
    'DISCONNECTED',
  ],
  ERROR: ['DISCONNECTING', 'DISCONNECTED', 'CONNECTING', 'BOOTLOADER_READY'],
  DISCONNECTING: ['DISCONNECTED', 'ERROR'],
};

/**
 * Evaluates whether a state transition from `from` to `to` is legally allowed.
 */
export function isValidTransition(from: DeviceState, to: DeviceState): boolean {
  // Staying in the same state is always idempotent and allowed
  if (from === to) return true;
  return VALID_STATE_TRANSITIONS[from]?.includes(to) ?? false;
}
