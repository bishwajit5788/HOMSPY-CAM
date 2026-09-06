export type BaudRate = 9600 | 19200 | 38400 | 57600 | 115200 | 230400 | 460800 | 921600;

export type LineEnding = '\n' | '\r\n' | '\r' | '';

export type LogType = 'rx' | 'tx' | 'system' | 'error' | 'flasher' | 'hardware';

export interface SerialLogEntry {
  id: string;
  timestamp: string;
  rawTime: number;
  text: string;
  type: LogType;
}

export interface SerialPortInfoSummary {
  usbVendorId?: number;
  usbProductId?: number;
  displayName: string;
  vendorName?: string;
}
