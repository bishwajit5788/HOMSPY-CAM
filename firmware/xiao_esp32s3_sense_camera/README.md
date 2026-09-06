# XIAO ESP32S3 Sense - Stage 1 Camera Firmware

This firmware provides initial board verification, OV2640 camera initialization, and MicroSD card detection for the **Seeed Studio XIAO ESP32S3 Sense**.

## Hardware Requirements

1. **Seeed Studio XIAO ESP32S3** (ESP32-S3FN8, 8MB Flash, 8MB OPI PSRAM)
2. **XIAO Sense Expansion Board** with OV2640 camera and microSD slot
3. USB-C cable (data capable)
4. (Optional) FAT32-formatted MicroSD card (32GB or smaller recommended)

## Arduino IDE Setup

1. Install Arduino IDE (v2.0 or newer).
2. Add ESP32 board manager URL:
   `https://espressif.github.io/arduino-esp32/package_esp32_index.json`
3. In Board Manager, install **esp32** by Espressif Systems (v2.0.11 or v3.0+).
4. Select Board: **XIAO_ESP32S3**.
5. Set Board Options:
   - **PSRAM**: OPI PSRAM (Enabled)
   - **Flash Size**: 8MB (64Mb)
   - **Flash Mode**: QIO 80MHz (or DIO 80MHz)
   - **Partition Scheme**: 8M with spiffs (3MB APP / 1.5MB SPIFFS) or Huge APP (3MB No OTA)
   - **USB CDC On Boot**: Enabled (allows Serial output over native USB)
   - **Upload Mode**: UART0 / Hardware CDC
6. Open `xiao_esp32s3_sense_camera.ino`.
7. Compile and export compiled binary, or use the pre-built binaries provided in `public/firmware/xiao_esp32s3_camera/`.

## Pin Connections (Internal B2B Connector)

| Function | GPIO | Notes |
| :--- | :--- | :--- |
| **CAM D0 (Y2)** | GPIO 15 | Data line 0 |
| **CAM D1 (Y3)** | GPIO 17 | Data line 1 |
| **CAM D2 (Y4)** | GPIO 18 | Data line 2 |
| **CAM D3 (Y5)** | GPIO 16 | Data line 3 |
| **CAM D4 (Y6)** | GPIO 14 | Data line 4 |
| **CAM D5 (Y7)** | GPIO 12 | Data line 5 |
| **CAM D6 (Y8)** | GPIO 11 | Data line 6 |
| **CAM D7 (Y9)** | GPIO 48 | Data line 7 |
| **CAM XCLK** | GPIO 10 | Clock out 20MHz |
| **CAM PCLK** | GPIO 13 | Pixel clock |
| **CAM VSYNC**| GPIO 38 | Frame sync |
| **CAM HREF** | GPIO 47 | Line sync |
| **CAM SDA**  | GPIO 40 | SCCB I2C Data |
| **CAM SCL**  | GPIO 39 | SCCB I2C Clock |
| **SD CS**    | GPIO 21 | MicroSD Chip Select |
| **SD SCK**   | GPIO 7  | MicroSD SPI Clock (D8) |
| **SD MISO**  | GPIO 8  | MicroSD SPI MISO (D9) |
| **SD MOSI**  | GPIO 9  | MicroSD SPI MOSI (D10)|

## Expected Serial Output (115200 Baud)

```
ESP32-S3 Camera Firmware
Board: XIAO ESP32S3 Sense
Camera: OV2640
Camera initialization: OK
SD card: detected
System ready
```
