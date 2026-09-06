import { describe, it, expect, vi } from 'vitest';
import { FlashService } from '../src/services/flashing/flashService';
import type { DeviceState } from '../src/types/state';

describe('FlashService Deterministic State Machine', () => {
  it('initializes with DISCONNECTED state and empty progress', () => {
    const service = new FlashService();
    expect(service.state).toBe('DISCONNECTED');
    expect(service.isBusy).toBe(false);
    expect(service.chip).toBeNull();

    const details = service.getStateDetails();
    expect(details.state).toBe('DISCONNECTED');
    expect(details.message).toBe('Ready to connect.');
    expect(details.error).toBeUndefined();
  });

  it('notifies state subscribers immediately upon subscription', () => {
    const service = new FlashService();
    const listener = vi.fn();

    const unsubscribe = service.subscribeState(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith({
      state: 'DISCONNECTED',
      message: 'Ready to connect.',
      error: undefined,
      troubleshooting: [],
    });

    unsubscribe();
  });

  it('notifies progress subscribers immediately upon subscription', () => {
    const service = new FlashService();
    const listener = vi.fn();

    const unsubscribe = service.subscribeProgress(listener);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener).toHaveBeenCalledWith(
      expect.objectContaining({
        stage: 'idle',
        percentage: 0,
        writtenBytes: 0,
      })
    );

    unsubscribe();
  });

  it('cleanly unsubscribes listeners', () => {
    const service = new FlashService();
    const listener = vi.fn();

    const unsubscribe = service.subscribeState(listener);
    expect(listener).toHaveBeenCalledTimes(1);

    unsubscribe();

    // Trigger disconnect which updates state
    void service.disconnect();
    // Should not receive any further calls
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('disconnect() transitions through DISCONNECTING and resets to DISCONNECTED', async () => {
    const service = new FlashService();
    const states: DeviceState[] = [];

    service.subscribeState((d) => states.push(d.state));

    await service.disconnect();

    expect(states).toContain('DISCONNECTING');
    expect(service.state).toBe('DISCONNECTED');
    expect(service.isBusy).toBe(false);
  });

  it('enforces concurrency lock: rejects overlapping connect operations', async () => {
    const service = new FlashService();

    // Mock an active operation
    (service as unknown as { isOperationActive: boolean }).isOperationActive = true;

    // Attempting a second operation must reject immediately
    await expect(service.connectDevice({} as SerialPort)).rejects.toThrow(
      'Another hardware operation is currently in progress'
    );
  });

  it('all 13 states conform to expected type definitions', () => {
    const allValidStates: DeviceState[] = [
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

    expect(allValidStates).toHaveLength(13);
  });
});
