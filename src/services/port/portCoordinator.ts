import { logService } from '../logger/logService';

export type PortOwner = 'none' | 'flasher' | 'monitor';
export interface PortLease { owner: PortOwner; port: SerialPort; leaseId: number; }
type LeaseChangeListener = (owner: PortOwner, port: SerialPort | null) => void;
type DisconnectListener = (port: SerialPort) => void;

export class PortCoordinator {
  private currentPort: SerialPort | null = null;
  private currentOwner: PortOwner = 'none';
  private currentLeaseId = 0;
  private leaseListeners = new Set<LeaseChangeListener>();
  private disconnectListeners = new Set<DisconnectListener>();
  private hasRegisteredDisconnectListener = false;

  constructor() { this.registerGlobalDisconnectListener(); }
  public get port(): SerialPort | null { return this.currentPort; }
  public get owner(): PortOwner { return this.currentOwner; }
  public get isLocked(): boolean { return this.currentOwner !== 'none'; }
  public subscribeLease(listener: LeaseChangeListener): () => void { this.leaseListeners.add(listener); listener(this.currentOwner, this.currentPort); return () => this.leaseListeners.delete(listener); }
  public onDisconnect(listener: DisconnectListener): () => void { this.disconnectListeners.add(listener); return () => this.disconnectListeners.delete(listener); }

  private registerGlobalDisconnectListener(): void {
    if (typeof navigator !== 'undefined' && 'serial' in navigator && !this.hasRegisteredDisconnectListener) {
      navigator.serial.addEventListener('disconnect', (event: Event) => {
        const port = (event as Event & { port?: SerialPort }).port;
        if (port && port === this.currentPort) {
          logService.addLog('CRITICAL: Physical USB device disconnect detected by PortCoordinator.', 'error');
          this.handleHardwareDisconnect(port);
        }
      });
      this.hasRegisteredDisconnectListener = true;
    }
  }

  private handleHardwareDisconnect(port: SerialPort): void {
    this.currentOwner = 'none';
    this.currentPort = null;
    this.currentLeaseId++;
    for (const listener of this.disconnectListeners) {
      try { listener(port); } catch (err) { console.error('Error in disconnect listener:', err); }
    }
    this.notifyLeaseChange();
  }

  public async acquireLease(requester: 'flasher' | 'monitor', port: SerialPort): Promise<PortLease> {
    if (this.currentOwner !== 'none' && this.currentOwner !== requester) {
      throw new Error(`Port conflict: Serial port is currently held by "${this.currentOwner}". Please stop or disconnect "${this.currentOwner}" before acquiring for "${requester}".`);
    }
    if (this.currentOwner === requester && this.currentPort && this.currentPort !== port) {
      throw new Error(`Port conflict: ${requester} already owns a different serial port. Release the existing lease before switching ports.`);
    }
    this.currentPort = port;
    this.currentOwner = requester;
    this.currentLeaseId++;
    const lease: PortLease = { owner: requester, port, leaseId: this.currentLeaseId };
    this.notifyLeaseChange();
    return lease;
  }

  public async releaseLease(requester: 'flasher' | 'monitor'): Promise<void> {
    if (this.currentOwner === requester) {
      this.currentOwner = 'none';
      this.currentPort = null;
      this.currentLeaseId++;
      this.notifyLeaseChange();
    }
  }

  public reset(): void {
    this.currentOwner = 'none';
    this.currentPort = null;
    this.currentLeaseId++;
    this.notifyLeaseChange();
  }

  private notifyLeaseChange(): void { this.leaseListeners.forEach((fn) => fn(this.currentOwner, this.currentPort)); }
}

export const portCoordinator = new PortCoordinator();
