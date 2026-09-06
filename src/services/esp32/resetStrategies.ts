import type { Transport } from 'esptool-js';
import { logService } from '../logger/logService';

/**
 * Executes a hardware reset sequence using DTR/RTS signals on a Web Serial port.
 * Standard ESP32/ESP32-S3 sequence:
 * - RTS controls EN (Enable/Reset pin, active low)
 * - DTR controls IO0 (Boot pin, active low)
 */
export async function performHardwareReset(port: SerialPort): Promise<void> {
  logService.addLog('Triggering hardware reset via DTR/RTS lines...', 'hardware');

  try {
    // 1. Assert EN (pull low to reset)
    await port.setSignals({ requestToSend: true, dataTerminalReady: false });
    await sleep(100);

    // 2. Release EN (pull high to run normal code)
    await port.setSignals({ requestToSend: false, dataTerminalReady: false });
    await sleep(50);

    logService.addLog('Hardware reset pulse completed.', 'hardware');
  } catch (err: unknown) {
    const error = err as Error;
    logService.addLog(`Hardware reset signal error: ${error.message}`, 'error');
  }
}

/**
 * Attempts a reset using the active esptool-js Transport.
 */
export async function resetViaTransport(transport: Transport): Promise<void> {
  try {
    logService.addLog('Sending reset signal through flasher transport...', 'flasher');
    await transport.setRTS(true);
    await sleep(100);
    await transport.setRTS(false);
    await sleep(100);
  } catch (err: unknown) {
    const error = err as Error;
    logService.addLog(`Transport reset failed: ${error.message}`, 'error');
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
