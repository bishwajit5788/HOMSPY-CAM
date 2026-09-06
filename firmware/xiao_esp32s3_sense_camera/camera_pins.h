/**
 * @file camera_pins.h
 * @brief Pin definitions for Seeed Studio XIAO ESP32S3 Sense Camera & SD Card
 *
 * Board: Seeed Studio XIAO ESP32S3 + Sense Expansion Board
 * Camera: Omnivision OV2640
 * MicroSD: SPI Mode / SD_MMC 1-bit Mode
 */

#pragma once

// ==========================================
// Seeed Studio XIAO ESP32S3 Sense Camera Pins
// ==========================================
#define PWDN_GPIO_NUM     -1
#define RESET_GPIO_NUM    -1
#define XCLK_GPIO_NUM     10
#define SIOD_GPIO_NUM     40
#define SIOC_GPIO_NUM     39

#define Y9_GPIO_NUM       48  // D7
#define Y8_GPIO_NUM       11  // D6
#define Y7_GPIO_NUM       12  // D5
#define Y6_GPIO_NUM       14  // D4
#define Y5_GPIO_NUM       16  // D3
#define Y4_GPIO_NUM       18  // D2
#define Y3_GPIO_NUM       17  // D1
#define Y2_GPIO_NUM       15  // D0

#define VSYNC_GPIO_NUM    38
#define HREF_GPIO_NUM     47
#define PCLK_GPIO_NUM     13

// ==========================================
// MicroSD Card SPI Interface Pins
// ==========================================
#define SD_CS_PIN         21  // Chip Select
#define SD_SCK_PIN        7   // SPI Clock (D8)
#define SD_MISO_PIN       8   // SPI MISO (D9)
#define SD_MOSI_PIN       9   // SPI MOSI (D10)
