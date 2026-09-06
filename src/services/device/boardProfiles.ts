import type { BoardProfile } from '../../types/esp32';

export const BOARD_PROFILES: BoardProfile[] = [
  {
    id: 'xiao-esp32s3-sense',
    name: 'Seeed Studio XIAO ESP32S3 Sense',
    manufacturer: 'Seeed Studio',
    mcu: 'ESP32-S3 (Xtensa dual-core 32-bit LX7 @ 240MHz)',
    psram: '8MB OPI PSRAM',
    flashSize: '8MB',
    recommendedFlashMode: 'dio',
    recommendedFlashFreq: '80m',
    defaultOffsets: {
      bootloader: '0x0',
      partitions: '0x8000',
      firmware: '0x10000',
    },
    features: [
      'OV2640 2-Megapixel Camera Sensor',
      'MicroSD Card Slot (SPI / SDMMC 1-bit)',
      'Digital Microphone (MSM261D3526H1CPM)',
      'Integrated Li-ion Battery Charging Circuit (Max 50mA / 100mA)',
      'Native USB-C (USB-OTG / USB-Serial-JTAG on GPIO19/20)',
      'Ultra-compact Form Factor (21 x 17.5 mm)',
      'Wi-Fi 4 (802.11 b/g/n) & Bluetooth 5.0 (BLE)',
    ],
    bootloaderGuide: {
      steps: [
        'Connect the XIAO ESP32S3 Sense to your computer using a reliable USB-C data cable.',
        'Locate the two miniature tactile buttons near the USB-C port: "B" (Boot) and "R" (Reset).',
        'Press and HOLD the "B" (Boot) button down.',
        'While still holding "B", briefly press and release the "R" (Reset) button (or plug in the USB cable while holding "B").',
        'Release the "B" button.',
        'In the web browser, click "Connect ESP32" and select the port (usually listed as "USB JTAG/serial debug unit" or "Seeed XIAO ESP32S3").',
      ],
      usbVendorId: 0x303a, // Espressif
      usbProductId: 0x1001, // USB JTAG/Serial debug unit
    },
  },
  {
    id: 'generic-esp32s3',
    name: 'Generic ESP32-S3 DevKit',
    manufacturer: 'Espressif Systems / Generic',
    mcu: 'ESP32-S3',
    psram: '2MB / 8MB (Depends on module)',
    flashSize: '8MB',
    recommendedFlashMode: 'dio',
    recommendedFlashFreq: '80m',
    defaultOffsets: {
      bootloader: '0x0',
      partitions: '0x8000',
      firmware: '0x10000',
    },
    features: [
      'ESP32-S3 dual-core LX7 processor',
      'Wi-Fi 802.11 b/g/n & BLE 5.0',
      'Native USB-Serial-JTAG support',
    ],
    bootloaderGuide: {
      steps: [
        'Connect the board to your computer via USB.',
        'Hold down the "BOOT" / "IO0" button.',
        'Press and release the "EN" / "RST" button.',
        'Release the "BOOT" button.',
        'Select the port in the browser popup.',
      ],
      usbVendorId: 0x303a,
    },
  },
];

export const DEFAULT_BOARD_PROFILE = BOARD_PROFILES[0];
