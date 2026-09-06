import { describe, it, expect, beforeEach } from 'vitest';
import { PortCoordinator } from '../src/services/port/portCoordinator';

describe('PortCoordinator', () => {
  let coordinator: PortCoordinator;
  let mockPort: SerialPort;

  beforeEach(() => {
    coordinator = new PortCoordinator();
    mockPort = {} as SerialPort;
  });

  it('initializes with no lease and unlocked port', () => {
    expect(coordinator.owner).toBe('none');
    expect(coordinator.port).toBeNull();
    expect(coordinator.isLocked).toBe(false);
  });

  it('grants flasher lease when port is free', async () => {
    const lease = await coordinator.acquireLease('flasher', mockPort);
    expect(lease.owner).toBe('flasher');
    expect(lease.port).toBe(mockPort);
    expect(coordinator.owner).toBe('flasher');
    expect(coordinator.isLocked).toBe(true);
  });

  it('grants monitor lease when port is free', async () => {
    const lease = await coordinator.acquireLease('monitor', mockPort);
    expect(lease.owner).toBe('monitor');
    expect(coordinator.owner).toBe('monitor');
    expect(coordinator.isLocked).toBe(true);
  });

  it('rejects monitor lease request when flasher owns the port', async () => {
    await coordinator.acquireLease('flasher', mockPort);

    await expect(coordinator.acquireLease('monitor', mockPort)).rejects.toThrow(
      'Port conflict: Serial port is currently held by "flasher"'
    );
    expect(coordinator.owner).toBe('flasher');
  });

  it('rejects flasher lease request when monitor owns the port', async () => {
    await coordinator.acquireLease('monitor', mockPort);

    await expect(coordinator.acquireLease('flasher', mockPort)).rejects.toThrow(
      'Port conflict: Serial port is currently held by "monitor"'
    );
    expect(coordinator.owner).toBe('monitor');
  });

  it('allows same owner to re-acquire lease idempotently', async () => {
    await coordinator.acquireLease('flasher', mockPort);
    const lease2 = await coordinator.acquireLease('flasher', mockPort);
    expect(lease2.owner).toBe('flasher');
  });

  it('releases lease cleanly and allows other owner to acquire', async () => {
    await coordinator.acquireLease('flasher', mockPort);
    await coordinator.releaseLease('flasher');

    expect(coordinator.owner).toBe('none');
    expect(coordinator.isLocked).toBe(false);

    const monitorLease = await coordinator.acquireLease('monitor', mockPort);
    expect(monitorLease.owner).toBe('monitor');
  });

  it('notifies subscribers upon lease state changes', async () => {
    const history: string[] = [];
    coordinator.subscribeLease((owner) => {
      history.push(owner);
    });

    await coordinator.acquireLease('flasher', mockPort);
    await coordinator.releaseLease('flasher');
    await coordinator.acquireLease('monitor', mockPort);

    expect(history).toEqual(['none', 'flasher', 'none', 'monitor']);
  });
});
