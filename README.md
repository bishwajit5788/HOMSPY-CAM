# ESP32-S3 Programmer — Seeed Studio XIAO ESP32S3 Sense

[![CI Pipeline](https://github.com/bishwajit5788/HOMSPY-CAM/actions/workflows/ci.yml/badge.svg)](https://github.com/bishwajit5788/HOMSPY-CAM/actions/workflows/ci.yml)
![Release Candidate](https://img.shields.io/badge/version-v0.9.0--rc.2-blue.svg)
![Status](https://img.shields.io/badge/status-Release%20Candidate%202-orange.svg)
![Hardware Readiness](https://img.shields.io/badge/hardware%20readiness-Ready%20for%20Validation-yellow.svg)

> **Production-grade Web Serial programmer, flasher, and serial diagnostics console for the Seeed Studio XIAO ESP32S3 Sense and ESP32-S3 devices.**

---

## Verification & Readiness Status

> [!IMPORTANT]
> **Release Status:** `v0.9.0-rc.2` — **SOFTWARE RELEASE CANDIDATE 2 — READY FOR REAL HARDWARE VALIDATION**
>
> * **Software Verified:** Web Serial integration, unified `PortCoordinator` with exclusive lease management, timeout cancellation & stream cleanup (`withTimeoutAndCleanup`), and Content Security Policy (CSP).
> * **Automated-Test Verified:** 58 unit tests across 6 test suites in Vitest covering firmware manifest schema, 4-byte offset alignment, address overlap detection, safe unknown flash capacity, hard error image header validation, guarded state transitions, monotonic operation tokens, and port lease conflict handling.
> * **Build / CI Verified:** Zero TypeScript errors (`tsc -b`), zero oxlint warnings, Vite production bundle generated, firmware integrity check script (`npm run verify:firmware`), security audit (`npm audit --audit-level=high`), and GitHub Actions CI matrix configured for Node 20.x & 22.x.
> * **Hardware Dependent / Hardware NOT Verified:** Physical silicon flash timing, ROM bootloader auto-sync on specific host USB controllers, OV2640 camera streaming, and MicroSD card FAT32 mounting require physical hardware bench testing using the 17-step protocol below.

---

## Table of Contents

1. [Overview](#1-overview)
2. [Deterministic 13-State Machine](#2-deterministic-13-state-machine)
3. [Flash Safety & Verification Architecture](#3-flash-safety--verification-architecture)
4. [Target Hardware Specifications](#4-target-hardware-specifications)
5. [Browser & OS Platform Requirements](#5-browser--os-platform-requirements)
6. [Entering ROM Bootloader Mode](#6-entering-rom-bootloader-mode)
7. [Firmware Manifest Format](#7-firmware-manifest-format)
8. [Stage 1 Camera Firmware](#8-stage-1-camera-firmware)
9. [Development & Automated Testing](#9-development--automated-testing)
10. [17-Step Hardware Verification Procedure](#10-17-step-hardware-verification-procedure)
11. [Troubleshooting Guide](#11-troubleshooting-guide)
12. [Hardware Pinout Reference](#12-hardware-pinout-reference)

---

## 1. Overview

**HOMSPY-CAM ESP32-S3 Programmer** is a zero-cloud, local-first web application designed to safely flash, erase, configure, and monitor the **Seeed Studio XIAO ESP32S3 Sense** directly from desktop browsers via the standard **Web Serial API**.

Flashing communicates directly with the ESP32-S3 ROM bootloader using Espressif's **esptool-js** (pinned at v0.6.1). The application features strict single-stream serial ownership, non-overlapping memory boundary enforcement, native Web Crypto SHA-256 integrity verification, and real-time serial diagnostics.

---

## 2. Deterministic 13-State Machine

The application transitions through a strict, deterministic 13-state machine to prevent invalid hardware states, double-writes, or orphaned serial streams:

```
[DISCONNECTED] ───────────────> [CONNECTING]
       ^                               │
       │                               v
 [DISCONNECTING]                 [CONNECTED]
       ^                               │
       │                               v
       │                         [DETECTING]
       │                               │
       │                               v
       │                      [BOOTLOADER_READY]
       │                               │
       │                               v
       │                         [VALIDATING]
       │                               │
       │                ┌──────────────┴──────────────┐
       │                v                             v
       │            [ERASING]                     [FLASHING]
       │                │                             │
       │                └──────────────┬──────────────┘
       │                               v
       │                          [VERIFYING]
       │                               │
       │                               v
       │                          [RESETTING]
       │                               │
       │                               v
       │                        [FLASH_COMPLETE]
       │                               │
       └───────────────────────────────┘
                                       │
                              (Any failure / drop)
                                       v
                                   [ERROR]
```

* **Concurrency Protection (`isBusy`):** An internal mutex rejects concurrent flash or erase commands while an active operation is executing.
* **Serial Port Ownership:** Explicitly tracked as `'none' | 'flasher' | 'monitor'`. Flasher and monitor can never collide or corrupt each other's byte streams.
* **Disconnect Recovery:** Listens for `navigator.serial` disconnect events. If the physical USB cable is detached, stream locks are released and state resets cleanly to `DISCONNECTED`.

---

## 3. Flash Safety & Verification Architecture

To protect physical flash chips from bricking or partition table corruption, `FirmwareValidator` executes 6 verification checks before flashing begins:

1. **Cryptographic SHA-256 Verification:** Pre-flash hashes computed via native Web Crypto API (`crypto.subtle`) are matched against manifest declarations.
2. **4-Byte Offset Alignment:** Every partition offset must be divisible by 4 (ESP32-S3 flash controller requirement).
3. **Address Overlap Detection:** Sorts all memory segments by offset and verifies `current.offset + current.size <= next.offset`.
4. **Flash Capacity Boundary Check:** Ensures no segment exceeds the physical flash memory boundary (e.g. 8MB for Seeed Studio XIAO ESP32S3).
5. **ESP-IDF Header Inspection:** Verifies standard ESP32 image magic byte (`0xE9`) and chip ID (`0x0009` for ESP32-S3) on executable images.
6. **Path Traversal & URL Injection Rejection:** Prohibits `..`, leading slashes, and external protocols in manifest paths.

---

## 4. Target Hardware Specifications

### Primary Target: **Seeed Studio XIAO ESP32S3 Sense**

* **Processor:** ESP32-S3 (Xtensa® dual-core 32-bit LX7 @ up to 240 MHz)
* **Flash Memory:** 8MB QSPI Flash (Default offset boundary: `0x800000`)
* **PSRAM:** 8MB High-Speed Octal SPI (OPI) PSRAM
* **Camera:** Omnivision OV2640 2-Megapixel sensor (up to 1600x1200 JPEG)
* **Storage:** Integrated MicroSD card slot (SPI / SDMMC 1-bit mode)
* **Microphone:** Digital PDM/I2S Microphone (MSM261D3526H1CPM)
* **USB:** Native USB-C (USB-OTG / USB-Serial-JTAG on GPIO19/GPIO20)
* **Wireless:** 2.4 GHz Wi-Fi (802.11 b/g/n) & Bluetooth 5.0 (BLE)

---

## 5. Browser & OS Platform Requirements

### Supported Browsers (Desktop Only)
* **Google Chrome** (v89+)
* **Microsoft Edge** (v89+)
* **Brave Browser**
* **Opera**

> [!WARNING]
> **Safari** and **Mozilla Firefox** do NOT support the Web Serial API. When opened on unsupported browsers, the application clearly indicates this limitation and guides users to a Chromium desktop browser.

### OS Permissions & Serial Setup

* **macOS:** Native support. When prompted by the browser, choose `USB JTAG/serial debug unit` or `Seeed XIAO ESP32S3`.
* **Windows 10/11:** Automatic CDC-ACM drivers.
* **Linux (Ubuntu, Debian, Fedora, Arch):**
  Add your user to the `dialout` group:
  ```bash
  sudo usermod -a -G dialout $USER
  ```
  Optional udev rule (`/etc/udev/rules.d/99-esp32.rules`):
  ```udev
  ATTRS{idVendor}=="303a", ATTRS{idProduct}=="1001", MODE="0666", GROUP="dialout"
  ```
  Reload: `sudo udevadm control --reload-rules && sudo udevadm trigger`

---

## 6. Entering ROM Bootloader Mode

Because the XIAO ESP32S3 uses native USB, the board must be placed into ROM bootloader mode to accept flashing commands if the user application is running:

1. Connect the XIAO ESP32S3 Sense using a verified data-capable USB-C cable.
2. Locate the two miniature tactile buttons next to the USB-C port:
   - **B** = BOOT button (top edge)
   - **R** = RESET button (bottom edge)
3. Press and **HOLD** the **B** (Boot) button.
4. While holding **B**, press and release the **R** (Reset) button.
   *(Alternative: Hold **B** while inserting the USB cable into your computer).*
5. Release the **B** button.
6. In the web application, click **[Connect ESP32 (Web Serial)]** and select the port.

---

## 7. Firmware Manifest Format

Firmware packages declare their layout using standard `manifest.json`:

```json
{
  "name": "Stage 1 Camera Firmware",
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
      "sha256": "32e76e5306d8778d91a9238e8ec436a000ba705663737b830d67d7168936dd3c",
      "size": 16384,
      "description": "ESP32-S3 2nd stage ROM bootloader"
    },
    {
      "path": "partitions.bin",
      "offset": "0x8000",
      "sha256": "4a94220ae1aa5e4125b29bfaef722650085a6fc5e4663a8a9a6cb2ce96cb6c3a",
      "size": 3072,
      "description": "ESP32-S3 partition table"
    },
    {
      "path": "firmware.bin",
      "offset": "0x10000",
      "sha256": "b64ced2f98f6d70ff8e5a7b88417c8cfbc76ff8bba1d8847849e7f41cf1d3319",
      "size": 524288,
      "description": "XIAO ESP32S3 Sense Stage 1 camera application"
    }
  ]
}
```

---

## 8. Stage 1 Camera Firmware

Source code is available in [`firmware/xiao_esp32s3_sense_camera/`](file:///Users/bishwajit/HOMSPY-CAM/firmware/xiao_esp32s3_sense_camera/):

* **`xiao_esp32s3_sense_camera.ino`**: Arduino/ESP-IDF C++ sketch with OV2640 camera initialization and SD card logging.
* **`camera_pins.h`**: Exact pin definitions matching the XIAO Sense expansion connector.

### Expected Diagnostics Output (115200 Baud)
```
ESP32-S3 Camera Firmware
Board: XIAO ESP32S3 Sense
Camera: OV2640
Camera initialization: OK
SD card: detected
System ready
```

---

## 9. Development & Automated Testing

```bash
# Install dependencies
npm install

# Run automated tests (Vitest)
npm test

# Run linter (oxlint)
npm run lint

# Compile and build production bundle
npm run build

# Start local development server
npm run dev
```

---

## 10. 17-Step Hardware Verification Procedure

When a physical **Seeed Studio XIAO ESP32S3 Sense** is connected, execute the following 17-step protocol to validate full end-to-end hardware compliance:

| Step | Test Name | Action | Expected Hardware Result |
| :---: | :--- | :--- | :--- |
| **A** | **Browser Compatibility** | Open app in Chrome / Edge | Web Serial support badge turns green ("Supported"). |
| **B** | **Device Discovery** | Click "Connect ESP32" | Native browser device picker lists `USB JTAG/serial debug unit`. |
| **C** | **Bootloader Sync** | Select port | Status reaches `BOOTLOADER_READY`; detects chip `ESP32-S3`. |
| **D** | **Telemetry Read** | Inspect Chip Panel | Displays MAC address, Flash ID, Flash Size (8MB). |
| **E** | **Built-in Package Load** | View Firmware Panel | Loads Stage 1 Camera package (3 binary segments, valid SHA-256). |
| **F** | **Custom Manifest Upload** | Upload zip / manifest | Validates offsets, detects overlaps, enforces 4-byte boundaries. |
| **G** | **Safety Rejection** | Upload invalid file | Shows exact error and blocks flashing if offset or flash exceeds limits. |
| **H** | **Full Chip Erase** | Click "Erase Flash" | Status transitions to `ERASING`; chip memory erased cleanly. |
| **I** | **Multi-Segment Flashing** | Click "Flash Firmware" | Status transitions to `VALIDATING` -> `FLASHING`; progress bar updates. |
| **J** | **On-Chip Verification** | Complete payload | Status reaches `VERIFYING`; on-chip MD5 checksums verified by ROM. |
| **K** | **Hardware Reset** | Observe board | Status reaches `RESETTING`; device reboot pulse transmitted. |
| **L** | **Serial Monitor Open** | Open Serial Panel | Connects at 115200 baud; ownership switches to `monitor`. |
| **M** | **Boot Output Capture** | Watch serial log | Captures ESP-IDF second-stage bootloader and Stage 1 banner. |
| **N** | **Sensor Diagnostics** | Read serial stream | Verifies `"Camera: OV2640"`, `"Camera initialization: OK"`, `"SD card: detected"`. |
| **O** | **Command Interactive** | Send command `status` | ESP32-S3 replies with uptime, free heap, and PSRAM status. |
| **P** | **Unexpected Cable Pull** | Unplug USB cable | App detects disconnect, releases port, and returns to `DISCONNECTED`. |
| **Q** | **Reconnection Recovery** | Reconnect USB cable | Device re-syncs cleanly without requiring browser tab reload. |

---

## 11. Troubleshooting Guide

| Problem | Cause | Solution |
| :--- | :--- | :--- |
| **"Web Serial Unsupported"** | Using Firefox, Safari, or mobile browser | Open application in Google Chrome, Microsoft Edge, Brave, or Opera on desktop. |
| **Bootloader sync failed / Timeout** | Board is running user firmware that owns USB | Put board into bootloader mode: Hold **B**, click **R**, release **B**, click Connect again. |
| **Port shows as "Busy" or "Locked"** | Another program (Arduino IDE, Cura, serial terminal) has the port open | Close other serial monitors/tools or refresh the tab. |
| **Flashing stalls at 0% or DIO error** | Flash mode set to QIO on a board requiring DIO | Keep Flash Mode set to **DIO (Dual I/O)**, which is standard for Seeed XIAO ESP32S3. |
| **Camera initialization FAILED** | Sense expansion board loose or not seated | Disconnect USB, press the expansion board firmly into the XIAO B2B connector, and reconnect. |
| **SD card: not detected** | Card not formatted as FAT32 or loose | Use a MicroSD card formatted as FAT32 (32GB or smaller recommended). |

---

## 12. Hardware Pinout Reference

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

---

## License

This project is licensed under the MIT License.
