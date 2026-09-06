import { useState, useEffect, useCallback, useRef } from 'react';
import type { StateDetails } from './types/state';
import type {
  ChipInfo,
  FlashConfig,
  FlashProgress,
  BoardProfile,
} from './types/esp32';
import type { FirmwarePackage } from './types/firmware';
import type { BaudRate, LineEnding, SerialLogEntry } from './types/serial';

import { getBrowserSupportInfo } from './utils/webSerialCheck';
import { logService } from './services/logger/logService';
import { serialService } from './services/serial/serialService';
import { flashService } from './services/flashing/flashService';
import { firmwareService } from './services/firmware/firmwareService';
import { performHardwareReset } from './services/esp32/resetStrategies';
import { DEFAULT_BOARD_PROFILE } from './services/device/boardProfiles';
import { mockSerialAdapter } from './services/mock/mockSerialAdapter';

import { Header } from './components/Header';
import { DevicePanel } from './components/DevicePanel';
import { FirmwarePanel } from './components/FirmwarePanel';
import { FlashProgressPanel } from './components/FlashProgressPanel';
import { SerialMonitorPanel } from './components/SerialMonitorPanel';
import { BootloaderGuideModal } from './components/BootloaderGuideModal';
import { BoardSpecsModal } from './components/BoardSpecsModal';
import { ErrorAlert } from './components/ErrorAlert';

export function App() {
  const browserInfo = useRef(getBrowserSupportInfo()).current;

  // Board Profile
  const [selectedBoard, setSelectedBoard] = useState<BoardProfile>(DEFAULT_BOARD_PROFILE);

  // Device & Flashing State
  const [stateDetails, setStateDetails] = useState<StateDetails>(flashService.getStateDetails());
  const [chipInfo, setChipInfo] = useState<ChipInfo | null>(null);
  const [flashProgress, setFlashProgress] = useState<FlashProgress>(flashService.currentProgress);

  // Firmware Payload & Configuration
  const [packageData, setPackageData] = useState<FirmwarePackage | null>(null);
  const [flashConfig, setFlashConfig] = useState<FlashConfig>({
    flashMode: 'dio',
    flashFreq: '80m',
    flashSize: '8MB',
    eraseAll: false,
    compress: true,
  });

  // Serial Monitor State
  const [logs, setLogs] = useState<SerialLogEntry[]>([]);
  const [isMonitorOpen, setIsMonitorOpen] = useState(false);
  const [baudRate, setBaudRate] = useState<BaudRate>(115200);
  const [lineEnding, setLineEnding] = useState<LineEnding>('\n');

  // Modals
  const [isBootloaderGuideOpen, setIsBootloaderGuideOpen] = useState(false);
  const [isBoardSpecsOpen, setIsBoardSpecsOpen] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Simulation Mode (Isolated Test Harness)
  const [isSimulationActive, setIsSimulationActive] = useState(false);
  const simulationStopFn = useRef<(() => void) | null>(null);

  // Reference to physical serial port
  const activeSerialPort = useRef<SerialPort | null>(null);

  // 1. Subscribe to flashService state & progress, and logService logs
  useEffect(() => {
    const unsubState = flashService.subscribeState((details) => {
      setStateDetails(details);
    });

    const unsubProgress = flashService.subscribeProgress((prog) => {
      setFlashProgress(prog);
    });

    const unsubLogs = logService.subscribe((currentLogs) => {
      setLogs(currentLogs);
    });

    // Auto-load built-in Stage 1 XIAO ESP32S3 Camera firmware on startup
    loadBuiltinFirmware();

    // Initial system log
    logService.addLog('ESP32-S3 Programmer initialized.', 'system');
    if (!browserInfo.isSupported) {
      logService.addLog(`Warning: ${browserInfo.message}`, 'error');
    }

    return () => {
      unsubState();
      unsubProgress();
      unsubLogs();
    };
  }, [browserInfo]);

  // Load built-in Stage 1 package
  const loadBuiltinFirmware = useCallback(async () => {
    try {
      setIsLoading(true);
      const pkg = await firmwareService.loadBuiltinCameraPackage();
      setPackageData(pkg);
      logService.addLog(
        `Loaded built-in firmware: ${pkg.name} (${pkg.files.length} segments, ${Math.round(pkg.totalSize / 1024)} KB)`,
        'system'
      );
    } catch (err: unknown) {
      const error = err as Error;
      logService.addLog(`Failed to load built-in firmware: ${error.message}`, 'error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Handle manifest package upload
  const handleLoadManifestAndFiles = async (manifestText: string, files: File[]) => {
    try {
      setIsLoading(true);
      const pkg = await firmwareService.createPackageFromManifestAndFiles(manifestText, files);
      setPackageData(pkg);
      logService.addLog(`Loaded custom manifest package: "${pkg.name}"`, 'system');
    } catch (err: unknown) {
      const error = err as Error;
      logService.addLog(`Manifest loading failed: ${error.message}`, 'error');
      alert(`Error loading manifest: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Handle custom binary files with offsets
  const handleLoadCustomFiles = async (entries: { file: File; offsetHex: string }[]) => {
    try {
      setIsLoading(true);
      const pkg = await firmwareService.createPackageFromCustomFiles(entries);
      setPackageData(pkg);
      logService.addLog(`Loaded ${pkg.files.length} custom binary file(s).`, 'system');
    } catch (err: unknown) {
      const error = err as Error;
      logService.addLog(`Custom file error: ${error.message}`, 'error');
      alert(`Error: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };

  // Connect ESP32
  const handleConnect = async () => {
    if (isSimulationActive) {
      try {
        setIsConnecting(true);
        const simChip = await mockSerialAdapter.simulateConnect();
        setChipInfo(simChip);
      } finally {
        setIsConnecting(false);
      }
      return;
    }

    if (!browserInfo.isSupported) {
      alert(browserInfo.recommendation || 'Web Serial API is not supported in this browser.');
      return;
    }

    try {
      setIsConnecting(true);
      logService.addLog('Requesting USB serial port from browser...', 'system');

      const port = await serialService.requestPort();
      activeSerialPort.current = port;

      // Close monitor if previously open
      if (isMonitorOpen) {
        await serialService.close();
        setIsMonitorOpen(false);
      }

      const chip = await flashService.connectDevice(port);
      setChipInfo(chip);
    } catch (err: unknown) {
      const error = err as Error;
      if (error.message.includes('No serial port was selected')) {
        logService.addLog('Connection cancelled: No port selected.', 'system');
      } else {
        logService.addLog(`Connection error: ${error.message}`, 'error');
      }
    } finally {
      setIsConnecting(false);
    }
  };

  // Disconnect
  const handleDisconnect = async () => {
    if (simulationStopFn.current) {
      simulationStopFn.current();
      simulationStopFn.current = null;
    }

    if (isMonitorOpen) {
      await serialService.close();
      setIsMonitorOpen(false);
    }

    await flashService.disconnect();
    activeSerialPort.current = null;
    setChipInfo(null);
  };

  // Hardware Reset / Reboot
  const handleHardwareReset = async () => {
    if (isSimulationActive) {
      logService.addLog('[SIMULATION-TEST] Hardware reset triggered.', 'hardware');
      return;
    }

    if (activeSerialPort.current) {
      await performHardwareReset(activeSerialPort.current);
    } else {
      await flashService.resetDevice();
    }
  };

  // Erase Flash
  const handleEraseFlash = async () => {
    if (isSimulationActive) {
      logService.addLog('[SIMULATION-TEST] Flash erase completed.', 'flasher');
      return;
    }

    try {
      await flashService.eraseFlash();
    } catch {
      // Error details handled via flashService state machine
    }
  };

  // Flash Firmware
  const handleStartFlash = async () => {
    if (!packageData) return;

    if (isSimulationActive) {
      try {
        await mockSerialAdapter.simulateFlash(
          packageData,
          flashConfig,
          (_fileIdx, written, total, fileName) => {
            logService.addLog(
              `[SIMULATION-TEST] Writing ${fileName} (${written}/${total} bytes)...`,
              'flasher'
            );
          }
        );
      } catch (err) {
        logService.addLog(`Simulation flash failed: ${err}`, 'error');
      }
      return;
    }

    if (isMonitorOpen) {
      logService.addLog('Pausing serial monitor for flashing operation...', 'system');
      await serialService.close();
      setIsMonitorOpen(false);
    }

    try {
      await flashService.flashPackage(packageData, flashConfig);
    } catch {
      // Error handled by flashService state machine
    }
  };

  // Toggle Serial Monitor
  const handleToggleMonitor = async () => {
    if (isSimulationActive) {
      if (isMonitorOpen) {
        if (simulationStopFn.current) {
          simulationStopFn.current();
          simulationStopFn.current = null;
        }
        setIsMonitorOpen(false);
        logService.addLog('[SIMULATION-TEST] Simulated monitor stopped.', 'system');
      } else {
        setIsMonitorOpen(true);
        logService.addLog(`[SIMULATION-TEST] Simulated monitor listening at ${baudRate} baud.`, 'system');
        simulationStopFn.current = mockSerialAdapter.simulateSerialOutput((line) => {
          logService.addLog(line, 'rx');
        });
      }
      return;
    }

    if (isMonitorOpen) {
      await serialService.close();
      setIsMonitorOpen(false);
    } else {
      if (!activeSerialPort.current) {
        try {
          const port = await serialService.requestPort();
          activeSerialPort.current = port;
        } catch (err: unknown) {
          const error = err as Error;
          logService.addLog(`Monitor start cancelled: ${error.message}`, 'system');
          return;
        }
      }

      // If flasher is holding transport, disconnect it first
      if (flashService.state !== 'DISCONNECTED') {
        await flashService.disconnect();
      }

      try {
        await serialService.openForMonitor(activeSerialPort.current, baudRate, () => {
          setIsMonitorOpen(false);
          logService.addLog('Device disconnected from serial port.', 'error');
        });
        setIsMonitorOpen(true);
      } catch (err: unknown) {
        const error = err as Error;
        logService.addLog(`Could not open monitor: ${error.message}`, 'error');
        alert(`Serial Monitor Error: ${error.message}`);
      }
    }
  };

  // Send Text over Serial
  const handleSendSerialText = async (text: string) => {
    if (isSimulationActive) {
      logService.addLog(`TX > ${text}`, 'tx');
      if (text.toLowerCase() === 'capture') {
        logService.addLog('[CAM] Capturing test frame...', 'rx');
        logService.addLog('[CAM] Frame captured successfully! Size: 49120 bytes (800x600)', 'rx');
        logService.addLog('[SD] Saved image to: /photo_0002.jpg', 'rx');
      } else if (text.toLowerCase() === 'status') {
        logService.addLog('--- System Status ---', 'rx');
        logService.addLog('Uptime: 45120 ms | Free Heap: 284120 bytes | PSRAM: 8388608 bytes', 'rx');
        logService.addLog('Camera: ACTIVE (OV2640) | MicroSD: MOUNTED', 'rx');
      } else {
        logService.addLog(`Echo: '${text}'`, 'rx');
      }
      return;
    }

    try {
      await serialService.write(text, lineEnding);
    } catch (err: unknown) {
      const error = err as Error;
      alert(`Send Error: ${error.message}`);
    }
  };

  // Toggle Test Simulation Mode
  const handleToggleSimulation = () => {
    if (isSimulationActive) {
      if (simulationStopFn.current) {
        simulationStopFn.current();
        simulationStopFn.current = null;
      }
      setIsSimulationActive(false);
      setIsMonitorOpen(false);
      setChipInfo(null);
      logService.addLog('Simulation test harness DEACTIVATED.', 'system');
    } else {
      setIsSimulationActive(true);
      logService.addLog('Simulation test harness ACTIVATED (UI testing without hardware).', 'system');
    }
  };

  return (
    <div className="app-container">
      {/* App Header */}
      <Header
        deviceState={stateDetails.state}
        browserInfo={browserInfo}
        onOpenBootloaderGuide={() => setIsBootloaderGuideOpen(true)}
        onOpenBoardSpecs={() => setIsBoardSpecsOpen(true)}
        isSimulationActive={isSimulationActive}
        onToggleSimulation={handleToggleSimulation}
      />

      {/* Main Grid: 2 Columns */}
      <main className="main-content">
        <div className="grid-layout">
          {/* Left Column: Device Connection & Firmware Payload Panels */}
          <div className="left-column">
            <DevicePanel
              deviceState={stateDetails.state}
              chipInfo={chipInfo}
              selectedBoard={selectedBoard}
              onSelectBoard={setSelectedBoard}
              onConnect={handleConnect}
              onDisconnect={handleDisconnect}
              onHardwareReset={handleHardwareReset}
              onOpenBootloaderGuide={() => setIsBootloaderGuideOpen(true)}
              isConnecting={isConnecting}
              disabled={isLoading}
            />

            <FirmwarePanel
              packageData={packageData}
              flashConfig={flashConfig}
              deviceState={stateDetails.state}
              onUpdateFlashConfig={(updates) => setFlashConfig((prev) => ({ ...prev, ...updates }))}
              onLoadBuiltin={loadBuiltinFirmware}
              onLoadManifestAndFiles={handleLoadManifestAndFiles}
              onLoadCustomFiles={handleLoadCustomFiles}
              onStartFlash={handleStartFlash}
              onEraseFlash={handleEraseFlash}
              isLoading={isLoading}
            />
          </div>

          {/* Right Column: Flash Progress & Real-time Serial Terminal */}
          <div className="right-column flex flex-col gap-4">
            <FlashProgressPanel
              progress={flashProgress}
              deviceState={stateDetails.state}
            />

            <div className="flex-1">
              <SerialMonitorPanel
                logs={logs}
                isMonitorOpen={isMonitorOpen}
                baudRate={baudRate}
                lineEnding={lineEnding}
                deviceState={stateDetails.state}
                onBaudRateChange={setBaudRate}
                onLineEndingChange={setLineEnding}
                onToggleMonitor={handleToggleMonitor}
                onClearLogs={() => logService.clear()}
                onExportLogs={() => logService.exportLogsAsText()}
                onSendText={handleSendSerialText}
              />
            </div>
          </div>
        </div>
      </main>

      {/* Modals & Dialogs */}
      <BootloaderGuideModal
        isOpen={isBootloaderGuideOpen}
        onClose={() => setIsBootloaderGuideOpen(false)}
      />

      <BoardSpecsModal
        isOpen={isBoardSpecsOpen}
        onClose={() => setIsBoardSpecsOpen(false)}
        boardProfile={selectedBoard}
      />

      <ErrorAlert
        stateDetails={stateDetails}
        onDismiss={() => flashService.disconnect()}
        onRetry={handleConnect}
      />
    </div>
  );
}
