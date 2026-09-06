import { describe, it, expect } from 'vitest';
import {
  isValidTransition,
  VALID_STATE_TRANSITIONS,
} from '../src/services/state/stateTransitions';
import { FlashService } from '../src/services/flashing/flashService';
import type { DeviceState } from '../src/types/state';

describe('Guarded State Transitions & Operation Tokens', () => {
  describe('isValidTransition Matrix', () => {
    it('permits idempotent transitions to same state', () => {
      const allStates: DeviceState[] = [
        'DISCONNECTED',
        'CONNECTING',
        'CONNECTED',
        'DETECTING',
        'BOOTLOADER_READY',
        'VALIDATING',
        'ERASING',
        'FLASHING',
        'VERIFYING',
        'RESETTING',
        'FLASH_COMPLETE',
        'ERROR',
        'DISCONNECTING',
      ];

      for (const s of allStates) {
        expect(isValidTransition(s, s)).toBe(true);
      }
    });

    it('permits valid linear forward transitions', () => {
      expect(isValidTransition('DISCONNECTED', 'CONNECTING')).toBe(true);
      expect(isValidTransition('CONNECTING', 'CONNECTED')).toBe(true);
      expect(isValidTransition('CONNECTED', 'DETECTING')).toBe(true);
      expect(isValidTransition('DETECTING', 'BOOTLOADER_READY')).toBe(true);
      expect(isValidTransition('BOOTLOADER_READY', 'VALIDATING')).toBe(true);
      expect(isValidTransition('VALIDATING', 'FLASHING')).toBe(true);
      expect(isValidTransition('FLASHING', 'VERIFYING')).toBe(true);
      expect(isValidTransition('VERIFYING', 'RESETTING')).toBe(true);
      expect(isValidTransition('RESETTING', 'FLASH_COMPLETE')).toBe(true);
    });

    it('permits valid recovery transitions to ERROR or DISCONNECTING', () => {
      expect(isValidTransition('CONNECTING', 'ERROR')).toBe(true);
      expect(isValidTransition('DETECTING', 'ERROR')).toBe(true);
      expect(isValidTransition('FLASHING', 'ERROR')).toBe(true);
      expect(isValidTransition('BOOTLOADER_READY', 'DISCONNECTING')).toBe(true);
      expect(isValidTransition('ERROR', 'DISCONNECTING')).toBe(true);
      expect(isValidTransition('DISCONNECTING', 'DISCONNECTED')).toBe(true);
    });

    it('blocks illegal and impossible jumps', () => {
      // Cannot jump straight from DISCONNECTED to flashing or resetting
      expect(isValidTransition('DISCONNECTED', 'FLASHING')).toBe(false);
      expect(isValidTransition('DISCONNECTED', 'RESETTING')).toBe(false);
      expect(isValidTransition('DISCONNECTED', 'BOOTLOADER_READY')).toBe(false);

      // Cannot jump from FLASHING back to CONNECTING directly
      expect(isValidTransition('FLASHING', 'CONNECTING')).toBe(false);
      expect(isValidTransition('FLASHING', 'DETECTING')).toBe(false);

      // Cannot jump from DISCONNECTING to FLASHING
      expect(isValidTransition('DISCONNECTING', 'FLASHING')).toBe(false);
    });

    it('all states in transition table are defined', () => {
      expect(Object.keys(VALID_STATE_TRANSITIONS)).toHaveLength(13);
    });
  });

  describe('Operation ID Tokens & Stale Promise Protection', () => {
    it('increments operationId upon new asynchronous operations', async () => {
      const flash = new FlashService();
      const initialOpId = flash.operationId;

      await flash.disconnect();
      expect(flash.operationId).toBeGreaterThan(initialOpId);
    });

    it('re-routes illegal transition attempts safely to ERROR state', () => {
      const flash = new FlashService();
      expect(flash.state).toBe('DISCONNECTED');

      // Attempting illegal direct jump to FLASHING
      (flash as unknown as { setState: (s: DeviceState, m: string) => void }).setState(
        'FLASHING',
        'Illegal jump'
      );

      // State machine should guard and route to ERROR
      expect(flash.state).toBe('ERROR');
      expect(flash.getStateDetails().message).toContain('Illegal state transition attempted');
    });
  });
});
