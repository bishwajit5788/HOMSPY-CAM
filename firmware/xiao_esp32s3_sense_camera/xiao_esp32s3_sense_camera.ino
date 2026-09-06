/**
 * @file xiao_esp32s3_sense_camera.ino
 * @brief Stage 1 Camera and MicroSD diagnostics firmware for Seeed Studio XIAO ESP32S3 Sense.
 *
 * This firmware initializes the ESP32-S3 microcontroller, mounts the OV2640 camera sensor,
 * tests MicroSD card communication, performs a single test frame capture, and reports
 * status over the native USB CDC serial interface at 115200 baud.
 *
 * Requirements satisfied:
 * - ESP32-S3 initialization
 * - OV2640 camera initialization and verification
 * - MicroSD card detection and status reporting
 * - Exact serial banner output as specified in requirement 10
 * - Single frame capture verification test
 */

#include "esp_camera.h"
#include "FS.h"
#include "SD.h"
#include "SPI.h"
#include "camera_pins.h"

// MicroSD SPI bus instance
SPIClass sdSPI(FSPI);
bool cameraReady = false;
bool sdCardReady = false;
uint32_t photoCounter = 1;

void setup() {
  // Initialize native USB Serial
  Serial.begin(115200);
  
  // Allow time for USB CDC connection if monitoring immediately
  unsigned long startWait = millis();
  while (!Serial && (millis() - startWait < 3000)) {
    delay(10);
  }
  delay(500);

  // Requirement 10: Specific Serial Diagnostics Output Header
  Serial.println();
  Serial.println("==========================================");
  Serial.println("ESP32-S3 Camera Firmware");
  Serial.println("Board: XIAO ESP32S3 Sense");
  Serial.println("Camera: OV2640");

  // 1. Configure and initialize OV2640 Camera
  camera_config_t config;
  config.ledc_channel = LEDC_CHANNEL_0;
  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;
  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;
  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;
  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;
  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;
  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM;
  config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM;
  config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;
  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.frame_size = FRAMESIZE_SVGA; // 800x600 resolution
  config.pixel_format = PIXFORMAT_JPEG;
  config.grab_mode = CAMERA_GRAB_WHEN_EMPTY;
  config.fb_location = CAMERA_FB_IN_PSRAM;
  config.jpeg_quality = 12; // 0-63, lower means higher quality
  config.fb_count = 2;

  // PSRAM check on XIAO ESP32S3 (8MB OPI PSRAM)
  if (psramFound()) {
    config.jpeg_quality = 10;
    config.fb_count = 2;
    config.grab_mode = CAMERA_GRAB_LATEST;
  } else {
    // Fallback to internal RAM if PSRAM not enabled in build flags
    config.frame_size = FRAMESIZE_QVGA;
    config.fb_location = CAMERA_FB_IN_DRAM;
    config.fb_count = 1;
  }

  esp_err_t err = esp_camera_init(&config);
  if (err == ESP_OK) {
    cameraReady = true;
    Serial.println("Camera initialization: OK");
  } else {
    cameraReady = false;
    Serial.printf("Camera initialization: FAILED (0x%x)\n", err);
    Serial.println("Note: Ensure the Sense expansion board is firmly connected to the XIAO B2B header.");
  }

  // 2. Initialize MicroSD Card
  sdSPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);
  pinMode(SD_CS_PIN, OUTPUT);
  digitalWrite(SD_CS_PIN, HIGH);

  if (SD.begin(SD_CS_PIN, sdSPI, 20000000)) {
    sdCardReady = true;
    uint8_t cardType = SD.cardType();
    if (cardType == CARD_NONE) {
      sdCardReady = false;
      Serial.println("SD card: not detected");
    } else {
      Serial.println("SD card: detected");
      uint64_t totalBytes = SD.totalBytes();
      uint64_t usedBytes = SD.usedBytes();
      Serial.printf("SD capacity: %llu MB (Used: %llu MB)\n", totalBytes / (1024 * 1024), usedBytes / (1024 * 1024));
    }
  } else {
    sdCardReady = false;
    Serial.println("SD card: not detected");
  }

  // Final confirmation line as specified
  Serial.println("System ready");
  Serial.println("==========================================");
  Serial.println("Commands available over serial:");
  Serial.println("  'capture' - Take a JPEG photo & save to MicroSD (if mounted)");
  Serial.println("  'status'  - Print camera and memory diagnostics");
  Serial.println("  'help'    - Show this help message");
  Serial.println();

  // Test photo capture if camera is initialized
  if (cameraReady) {
    performTestCapture();
  }
}

void performTestCapture() {
  Serial.println("[CAM] Capturing test frame...");
  camera_fb_t *fb = esp_camera_fb_get();
  if (!fb) {
    Serial.println("[CAM] Frame buffer acquisition failed!");
    return;
  }

  Serial.printf("[CAM] Frame captured successfully! Size: %zu bytes (%dx%d)\n", fb->len, fb->width, fb->height);

  if (sdCardReady) {
    char filename[32];
    snprintf(filename, sizeof(filename), "/photo_%04lu.jpg", photoCounter++);
    File file = SD.open(filename, FILE_WRITE);
    if (file) {
      size_t written = file.write(fb->buf, fb->len);
      file.close();
      if (written == fb->len) {
        Serial.printf("[SD] Saved image to: %s\n", filename);
      } else {
        Serial.printf("[SD] Write error: wrote %zu / %zu bytes\n", written, fb->len);
      }
    } else {
      Serial.println("[SD] Failed to open file for writing on SD card");
    }
  }

  esp_camera_fb_return(fb);
}

void printStatus() {
  Serial.println();
  Serial.println("--- System Status ---");
  Serial.printf("Uptime: %lu ms\n", millis());
  Serial.printf("Free Internal Heap: %u bytes\n", ESP.getFreeHeap());
  if (psramFound()) {
    Serial.printf("Free PSRAM: %u / %u bytes\n", ESP.getFreePsram(), ESP.getPsramSize());
  } else {
    Serial.println("PSRAM: Not detected / Not enabled");
  }
  Serial.printf("Camera status: %s\n", cameraReady ? "ACTIVE (OV2640)" : "OFFLINE");
  Serial.printf("MicroSD status: %s\n", sdCardReady ? "MOUNTED" : "UNMOUNTED");
  Serial.println("---------------------");
}

void loop() {
  // Check for serial commands from the Web Serial Monitor
  if (Serial.available()) {
    String command = Serial.readStringUntil('\n');
    command.trim();

    if (command.equalsIgnoreCase("capture")) {
      if (cameraReady) {
        performTestCapture();
      } else {
        Serial.println("[ERR] Camera is not initialized.");
      }
    } else if (command.equalsIgnoreCase("status")) {
      printStatus();
    } else if (command.equalsIgnoreCase("help")) {
      Serial.println("Available commands: capture, status, help");
    } else if (command.length() > 0) {
      Serial.printf("Echo: '%s' (type 'help' for commands)\n", command.c_str());
    }
  }

  delay(10);
}
