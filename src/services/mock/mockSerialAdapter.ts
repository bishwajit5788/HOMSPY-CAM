import type { ChipInfo, FlashConfig } from '../../types/esp32';
import type { FirmwarePackage } from '../../types/firmware';
import { logService } from '../logger/logService';

/**
 * Isolated Mock Adapter for testing UI states when physical hardware is not present.
 * NOTE: Every log and result from this adapter is explicitly tagged with [SIMULATION-TEST]
 * and must NEVER be represented as physical hardware results.
 */
export class MockSerialAdapter {
  private isSimulating = false;

  public get active(): boolean {
    return this.isSimulating;
  }

  public async simulateConnect(): Promise<ChipInfo> {
    this.isSimulating = true;
    logService.addLog('[SIMULATION-TEST] Connecting to simulated XIAO ESP32S3 Sense...', 'system');
    await this.sleep(600);
    logService.addLog('[SIMULATION-TEST] Syncing with simulated ROM bootloader (ESP32-S3)...', 'flasher');
    await this.sleep(700);

    const mockChip: ChipInfo = {
      chipName: 'ESP32-S3 (Simulated Test Device)',
      macAddress: '34:85:18:A1:B2:C3',
      description: 'Seeed Studio XIAO ESP32S3 Sense (Virtual Test Rig)',
      flashSize: '8MB',
      flashId: '0x1740C8',
      vendorId: '0x303a (Espressif)',
      productId: '0x1001 (USB-JTAG)',
      features: ['Wi-Fi 4', 'BLE 5.0', 'OV2640', 'MicroSD', '8MB OPI PSRAM'],
    };

    logService.addLog('[SIMULATION-TEST] Chip identified: ESP32-S3. Bootloader ready.', 'flasher');
    return mockChip;
  }

  public async simulateFlash(
    pkg: FirmwarePackage,
    _config: FlashConfig,
    onProgress: (fileIdx: number, written: number, total: number, fileName: string) => void
  ): Promise<void> {
    logService.addLog(`[SIMULATION-TEST] Starting test flash of "${pkg.name}"...`, 'flasher');

    for (let fileIdx = 0; fileIdx < pkg.files.length; fileIdx++) {
      const file = pkg.files[fileIdx];
      const fileSize = file.size;
      const steps = 10;
      for (let s = 1; s <= steps; s++) {
        await this.sleep(120);
        const written = Math.round((s / steps) * fileSize);
        onProgress(fileIdx, written, fileSize, file.fileName);
      }
    }

    logService.addLog('[SIMULATION-TEST] Validating MD5 hash against simulated memory...', 'flasher');
    await this.sleep(400);
    logService.addLog('[SIMULATION-TEST] MD5 hash verified. Device reset into execution mode.', 'flasher');
  }

  public simulateSerialOutput(onLine: (line: string) => void): () => void {
    const lines = [
      'ESP32-S3 Camera Firmware',
      'Board: XIAO ESP32S3 Sense',
      'Camera: OV2640',
      'Camera initialization: OK',
      'SD card: detected',
      'SD capacity: 15193 MB (Used: 42 MB)',
      'System ready',
      '[CAM] Capturing test frame...',
      '[CAM] Frame captured successfully! Size: 48210 bytes (800x600)',
      '[SD] Saved image to: /photo_0001.jpg',
    ];

    let index = 0;
    const interval = setInterval(() => {
      if (index < lines.length) {
        onLine(lines[index]);
        index++;
      }
    }, 800);

    return () => clearInterval(interval);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }
}

export const mockSerialAdapter = new MockSerialAdapter();
