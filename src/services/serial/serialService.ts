import type { BaudRate, LineEnding } from '../../types/serial';
import { logService } from '../logger/logService';

export type PortOwner = 'none' | 'flasher' | 'monitor';

export class SerialService {
  private currentPort: SerialPort | null = null;
  private reader: ReadableStreamDefaultReader<string> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private isReading = false;
  private lineBuffer = '';
  private disconnectHandler: (() => void) | null = null;
  private currentOwner: PortOwner = 'none';
  private hasRegisteredDisconnectListener = false;

  public get port(): SerialPort | null {
    return this.currentPort;
  }

  public get isOpen(): boolean {
    return this.currentPort !== null && this.isReading;
  }

  public get owner(): PortOwner {
    return this.currentOwner;
  }

  constructor() {
    this.registerGlobalDisconnectListener();
  }

  /**
   * Registers global Web Serial disconnect event listener.
   */
  private registerGlobalDisconnectListener(): void {
    if (typeof navigator !== 'undefined' && 'serial' in navigator && !this.hasRegisteredDisconnectListener) {
      navigator.serial.addEventListener('disconnect', (event: Event) => {
        const customEvent = event as Event & { port?: SerialPort };
        if (customEvent.port && customEvent.port === this.currentPort) {
          logService.addLog('CRITICAL: Web Serial hardware port disconnected.', 'error');
          this.handleHardwareDisconnect();
        }
      });
      this.hasRegisteredDisconnectListener = true;
    }
  }

  /**
   * Handles unexpected hardware detachment.
   */
  private async handleHardwareDisconnect(): Promise<void> {
    const handler = this.disconnectHandler;
    await this.close();
    if (handler) {
      handler();
    }
  }

  /**
   * Prompts the browser's native serial port chooser.
   */
  public async requestPort(): Promise<SerialPort> {
    if (!navigator.serial) {
      throw new Error('Web Serial API is not supported in this browser.');
    }

    try {
      const port = await navigator.serial.requestPort({
        filters: [
          // Espressif USB vendor IDs
          { usbVendorId: 0x303a },
          // Common USB UART bridges (CP210x, CH34x, FTDI)
          { usbVendorId: 0x10c4 },
          { usbVendorId: 0x1a86 },
          { usbVendorId: 0x0403 },
        ],
      });
      return port;
    } catch (err: unknown) {
      const error = err as Error;
      if (error.name === 'NotFoundError') {
        throw new Error('No serial port was selected.');
      }
      throw error;
    }
  }

  /**
   * Returns serial ports previously authorized by the user.
   */
  public async getAuthorizedPorts(): Promise<SerialPort[]> {
    if (!navigator.serial) return [];
    try {
      return await navigator.serial.getPorts();
    } catch {
      return [];
    }
  }

  /**
   * Acquires ownership lock on the serial port.
   */
  public acquireOwnership(owner: PortOwner): void {
    if (this.currentOwner !== 'none' && this.currentOwner !== owner) {
      throw new Error(
        `Port conflict: Serial port is currently owned by "${this.currentOwner}". Release it before acquiring for "${owner}".`
      );
    }
    this.currentOwner = owner;
  }

  /**
   * Releases ownership lock on the serial port.
   */
  public releaseOwnership(owner: PortOwner): void {
    if (this.currentOwner === owner) {
      this.currentOwner = 'none';
    }
  }

  /**
   * Opens the serial port for serial monitoring at the chosen baud rate.
   */
  public async openForMonitor(
    port: SerialPort,
    baudRate: BaudRate = 115200,
    onDisconnect?: () => void
  ): Promise<void> {
    // If monitor is already running, shut it down first
    if (this.currentPort && this.isOpen) {
      await this.close();
    }

    this.acquireOwnership('monitor');
    this.currentPort = port;
    this.disconnectHandler = onDisconnect || null;

    try {
      await port.open({
        baudRate,
        dataBits: 8,
        stopBits: 1,
        parity: 'none',
        bufferSize: 4096,
      });

      logService.addLog(`Serial monitor opened at ${baudRate} baud.`, 'system');

      // Setup writer for serial transmission
      if (port.writable) {
        this.writer = port.writable.getWriter();
      }

      // Start asynchronous stream read loop
      this.isReading = true;
      this.startReadLoop(port);
    } catch (err: unknown) {
      const error = err as Error;
      this.releaseOwnership('monitor');
      this.currentPort = null;
      throw new Error(`Failed to open serial port for monitoring: ${error.message || error}`);
    }
  }

  /**
   * Starts reading text data from the serial port using TransformStream.
   */
  private async startReadLoop(port: SerialPort): Promise<void> {
    if (!port.readable) return;

    try {
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = (port.readable as ReadableStream<BufferSource>).pipeTo(
        textDecoder.writable
      );
      this.reader = textDecoder.readable.getReader();

      while (this.isReading && this.reader) {
        const { value, done } = await this.reader.read();
        if (done) break;
        if (value) {
          this.handleIncomingText(value);
        }
      }

      await readableStreamClosed.catch(() => {});
    } catch (err: unknown) {
      const error = err as Error;
      if (this.isReading) {
        logService.addLog(`Serial read notice: ${error.message || error}`, 'system');
        if (this.disconnectHandler) {
          this.disconnectHandler();
        }
      }
    } finally {
      this.isReading = false;
    }
  }

  /**
   * Buffers incoming serial data and emits complete lines to the logger.
   */
  private handleIncomingText(chunk: string): void {
    this.lineBuffer += chunk;
    const lines = this.lineBuffer.split('\n');

    // Keep unfinished segment in buffer
    this.lineBuffer = lines.pop() || '';

    for (const line of lines) {
      const cleanLine = line.replace(/\r/g, '');
      if (cleanLine.length > 0 || line === '') {
        logService.addLog(cleanLine, 'rx');
      }
    }
  }

  /**
   * Writes text data to the open serial port with timeout.
   */
  public async write(text: string, lineEnding: LineEnding = '\n'): Promise<void> {
    if (!this.writer) {
      throw new Error('Serial port is not writable. Connect to the device and start the monitor first.');
    }

    const payload = `${text}${lineEnding}`;
    const encoder = new TextEncoder();
    const data = encoder.encode(payload);

    try {
      await this.writer.write(data);
      logService.addLog(`TX > ${text}`, 'tx');
    } catch (err: unknown) {
      const error = err as Error;
      logService.addLog(`Failed to transmit serial data: ${error.message}`, 'error');
      throw error;
    }
  }

  /**
   * Closes the active serial monitor connection cleanly, unlocking streams.
   */
  public async close(): Promise<void> {
    this.isReading = false;

    // Flush any remaining partial line
    if (this.lineBuffer.trim().length > 0) {
      logService.addLog(this.lineBuffer.replace(/\r/g, ''), 'rx');
      this.lineBuffer = '';
    }

    if (this.reader) {
      try {
        await this.reader.cancel().catch(() => {});
      } catch {
        // Ignore cancel errors
      }
      try {
        this.reader.releaseLock();
      } catch {
        // Ignore unlock errors
      }
      this.reader = null;
    }

    if (this.writer) {
      try {
        await this.writer.close().catch(() => {});
      } catch {
        // Ignore close errors
      }
      try {
        this.writer.releaseLock();
      } catch {
        // Ignore unlock errors
      }
      this.writer = null;
    }

    if (this.currentPort) {
      try {
        await this.currentPort.close().catch(() => {});
      } catch {
        // Ignore port close errors
      }
      this.currentPort = null;
    }

    this.releaseOwnership('monitor');
    logService.addLog('Serial monitor closed cleanly.', 'system');
  }

  /**
   * Sets DTR and RTS control signals on the port.
   */
  public async setSignals(dtr: boolean, rts: boolean): Promise<void> {
    if (!this.currentPort) return;
    try {
      await this.currentPort.setSignals({
        dataTerminalReady: dtr,
        requestToSend: rts,
      });
    } catch (err) {
      console.warn('Could not set serial control signals:', err);
    }
  }
}

export const serialService = new SerialService();
