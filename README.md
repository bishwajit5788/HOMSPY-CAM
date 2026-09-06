# ESP32-S3 Programmer — Seeed Studio XIAO ESP32S3 Sense

> **Production-grade Web Serial programmer, flasher, and serial diagnostics console for the Seeed Studio XIAO ESP32S3 Sense and ESP32-S3 devices.**

---

## Table of Contents

1. [Overview](#overview)
2. [Target Hardware](#target-hardware)
3. [Browser & Operating System Requirements](#browser--operating-system-requirements)
4. [Entering ESP32-S3 ROM Bootloader Mode](#entering-esp32-s3-rom-bootloader-mode)
5. [Firmware Manifest Format](#firmware-manifest-format)
6. [Stage 1 Camera Firmware](#stage-1-camera-firmware)
7. [Features & Capabilities](#features--capabilities)
8. [Development & Build Instructions](#development--build-instructions)
9. [Troubleshooting Guide](#troubleshooting-guide)
10. [Hardware Pinout Reference](#hardware-pinout-reference)

---

## 1. Overview

**ESP32-S3 Programmer** is a local-first, zero-cloud web application designed to flash, erase, configure, and monitor the **Seeed Studio XIAO ESP32S3 Sense** directly from compatible desktop web browsers over USB.

The application communicates directly with the ESP32-S3 ROM bootloader using the **Web Serial API** and Espressif's official **esptool-js** (pinned at v0.6.1), providing genuine hardware synchronization, flash erasure, multi-binary segment writing with compression, on-chip MD5 checksum verification, and interactive serial monitoring.

---

## 2. Target Hardware

### Primary Target: **Seeed Studio XIAO ESP32S3 Sense**

* **Processor:** ESP32-S3 (Xtensa® dual-core 32-bit LX7 @ up to 240 MHz)
* **Flash Memory:** 8MB QSPI Flash
* **PSRAM:** 8MB High-Speed Octal SPI (OPI) PSRAM
* **Camera:** Omnivision OV2640 2-Megapixel sensor (up to 1600x1200 JPEG)
* **Storage:** Integrated MicroSD card slot (SPI / SDMMC 1-bit mode)
* **Microphone:** Digital PDM/I2S Microphone (MSM261D3526H1CPM)
* **USB:** Native USB-C (USB-OTG / USB-Serial-JTAG controller on GPIO19/GPIO20)
* **Wireless:** 2.4 GHz Wi-Fi (802.11 b/g/n) & Bluetooth 5.0 (BLE)
* **Battery Management:** Onboard Li-ion battery charging circuit (50mA / 100mA)

---

## 3. Browser & Operating System Requirements

### Supported Browsers (Desktop Only)
* **Google Chrome** (v89+)
* **Microsoft Edge** (v89+)
* **Brave Browser**
* **Opera**

> [!WARNING]
> **Safari** and **Mozilla Firefox** do NOT currently support the Web Serial API. When opened on unsupported browsers, the application clearly indicates this limitation and guides users to a Chromium desktop browser.

### Operating System Permissions

* **macOS:** No special drivers required. When prompted by the browser, select the `USB JTAG/serial debug unit` or `Seeed XIAO ESP32S3` device.
* **Windows 10/11:** Automatically installs native CDC-ACM drivers. If unrecognized, install the standard Espressif USB drivers or CH34x/CP210x drivers if using an external UART bridge.
* **Linux (Ubuntu, Debian, Fedora, Arch):**
  Ensure your user belongs to the `dialout` (or `uucp` / `plugdev`) group:
  ```bash
  sudo usermod -a -G dialout $USER
  ```
  If needed, add a udev rule for Espressif native USB (`/etc/udev/rules.d/99-esp32.rules`):
  ```udev
  ATTRS{idVendor}=="303a", ATTRS{idProduct}=="1001", MODE="0666", GROUP="dialout"
  ```
  Then reload udev: `sudo udevadm control --reload-rules && sudo udevadm trigger`

---

## 4. Entering ESP32-S3 ROM Bootloader Mode

Because the XIAO ESP32S3 uses native USB, the board must be placed into ROM bootloader mode to accept flashing commands if the user application is running:

1. Connect the XIAO ESP32S3 Sense to your computer using a verified data-capable USB-C cable.
2. Locate the two miniature tactile buttons next to the USB-C port:
   - **B** = BOOT button (top edge)
   - **R** = RESET button (bottom edge)
3. Press and **HOLD** the **B** (Boot) button.
4. While holding **B**, press and release the **R** (Reset) button.
   *(Alternative: Hold **B** while inserting the USB cable into your computer).*
5. Release the **B** button.
6. In the web application, click **[Connect ESP32 (Web Serial)]** and choose the port.

---

## 5. Firmware Manifest Format

The application supports structured firmware project manifests (`manifest.json`):

```json
{
  "name": "XIAO ESP32S3 Camera",
  "version": "1.0.0",
  "chip": "ESP32-S3",
  "board": "Seeed Studio XIAO ESP32S3 Sense",
  "flash_size": "8MB",
  "flash_mode": "dio",
  "flash_freq": "80m",
  "files": [
    {
      "path": "bootloader.bin",
      "offset": "0x0",
      "description": "ESP32-S3 2nd stage ROM bootloader"
    },
    {
      "path": "partitions.bin",
      "offset": "0x8000",
      "description": "ESP32-S3 partition table"
    },
    {
      "path": "firmware.bin",
      "offset": "0x10000",
      "description": "XIAO ESP32S3 Sense Stage 1 camera application"
    }
  ]
}
```

### Pre-Flash Firmware Summary

Before flashing, the application verifies and displays a complete summary:
* Target Chip model
* Firmware Name & Version
* Complete table of binary files with offsets, sizes in KB, and calculated MD5 hashes
* Aggregate payload size

---

## 6. Stage 1 Camera Firmware

Source code is available in [`firmware/xiao_esp32s3_sense_camera/`](file:///Users/bishwajit/HOMSPY-CAM/firmware/xiao_esp32s3_sense_camera/):

* **`xiao_esp32s3_sense_camera.ino`**: Arduino/ESP-IDF C++ sketch.
* **`camera_pins.h`**: Exact pin definitions matching the XIAO Sense expansion connector.

### Diagnostics Output (115200 Baud)
```
ESP32-S3 Camera Firmware
Board: XIAO ESP32S3 Sense
Camera: OV2640
Camera initialization: OK
SD card: detected
System ready
```

### Supported Serial Commands
* `capture` — Takes a test JPEG frame and saves it to the MicroSD card as `/photo_XXXX.jpg`.
* `status` — Reports system uptime, free heap, free PSRAM, and sensor status.
* `help` — Displays available commands.

---

## 7. Features & Capabilities

* **Web Serial API Connection:** Clean hardware port selection with Espressif vendor filtering.
* **Chip Detection:** Identifies ESP32-S3, reads MAC address, flash size, and SPI flash ID.
* **Flash Operations:** Full chip erase or multi-segment write with compression.
* **MD5 Verification:** Computes MD5 checksum of every payload segment and verifies it directly against the ESP32-S3 flash controller.
* **Live Progress Reporting:** Real-time percentage, data written / total bytes, transfer rate (KB/s), and elapsed time.
* **Full Serial Monitor:**
  * Baud rates: 9600, 19200, 38400, 57600, 115200 (default), 230400, 460800, 921600.
  * Line endings: LF (`\n`), CRLF (`\r\n`), CR (`\r`), None.
  * Timestamps in `[HH:MM:SS.mmm]` format.
  * Controls: Start/Stop, Pause/Resume, Auto-scroll toggle, Clear, Export log to `.txt`.
* **Zero Fake States:** Strict state machine (`DISCONNECTED`, `CONNECTING`, `CONNECTED`, `DETECTING`, `BOOTLOADER_READY`, `FLASHING`, `VERIFYING`, `FLASH_COMPLETE`, `ERROR`).
* **Isolated Simulation Mode:** Optional test harness for UI validation when physical hardware is not plugged in (clearly marked in UI).

---

## 8. Development & Build Instructions

```bash
# 1. Install dependencies
npm install

# 2. Start local development server
npm run dev

# 3. Build optimized production bundle
npm run build

# 4. Preview production build locally
npm run preview
```

---

## 9. Troubleshooting Guide

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **"Web Serial Unsupported"** | Using Firefox, Safari, or mobile browser | Open application in Google Chrome, Microsoft Edge, Brave, or Opera on desktop. |
| **Bootloader sync failed / Timeout** | Board is running user firmware that owns USB | Put board into bootloader mode: Hold **B**, click **R**, release **B**, click Connect again. |
| **Port shows as "Busy" or "Locked"** | Another program (Arduino IDE, Cura, serial terminal) has the port open | Close other serial monitors/tools or refresh the tab. |
| **Flashing stalls at 0% or DIO error** | Flash mode set to QIO on a board requiring DIO | Keep Flash Mode set to **DIO (Dual I/O)**, which is standard for Seeed XIAO ESP32S3. |
| **Camera initialization FAILED** | Sense expansion board loose or not seated | Disconnect USB, press the expansion board firmly into the XIAO B2B connector, and reconnect. |
| **SD card: not detected** | Card not formatted as FAT32 or loose | Use a MicroSD card formatted as FAT32 (32GB or smaller recommended). |

---

## 10. Hardware Pinout Reference

### Camera Sensor (OV2640) on XIAO Sense Expansion Board

| Signal | ESP32-S3 GPIO | Note |
| :--- | :--- | :--- |
| **CAM D0 (Y2)** | GPIO 15 | Data Bit 0 |
| **CAM D1 (Y3)** | GPIO 17 | Data Bit 1 |
| **CAM D2 (Y4)** | GPIO 18 | Data Bit 2 |
| **CAM D3 (Y5)** | GPIO 16 | Data Bit 3 |
| **CAM D4 (Y6)** | GPIO 14 | Data Bit 4 |
| **CAM D5 (Y7)** | GPIO 12 | Data Bit 5 |
| **CAM D6 (Y8)** | GPIO 11 | Data Bit 6 |
| **CAM D7 (Y9)** | GPIO 48 | Data Bit 7 |
| **CAM XCLK** | GPIO 10 | 20 MHz Master Clock |
| **CAM PCLK** | GPIO 13 | Pixel Clock |
| **CAM VSYNC** | GPIO 38 | Frame Sync |
| **CAM HREF** | GPIO 47 | Line Sync |
| **CAM SDA** | GPIO 40 | SCCB I2C Data |
| **CAM SCL** | GPIO 39 | SCCB I2C Clock |

### MicroSD Card SPI Interface

| Signal | ESP32-S3 GPIO | Note |
| :--- | :--- | :--- |
| **SD CS** | GPIO 21 | Chip Select |
| **SD SCK** | GPIO 7 | SPI Clock (D8) |
| **SD MISO** | GPIO 8 | Master In Slave Out (D9) |
| **SD MOSI** | GPIO 9 | Master Out Slave In (D10) |
