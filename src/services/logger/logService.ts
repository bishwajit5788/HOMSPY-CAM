import type { SerialLogEntry, LogType, LogSeverity } from '../../types/serial';
import { formatTimestamp } from '../../utils/formatters';

type LogListener = (logs: SerialLogEntry[], latest: SerialLogEntry) => void;

function severityFor(type: LogType): LogSeverity {
  if (type === 'error') return 'error';
  if (type === 'hardware' || type === 'flasher') return 'info';
  return 'info';
}

class LogService {
  private logs: SerialLogEntry[] = [];
  private listeners: Set<LogListener> = new Set();
  private maxLogs = 5000;
  private sessionId = `${Date.now()}-${crypto.randomUUID?.() || Math.random().toString(36).slice(2)}`;

  public get session(): string { return this.sessionId; }
  public getLogs(): SerialLogEntry[] { return [...this.logs]; }

  public addLog(text: string, type: LogType = 'system', options: { event?: string; operationId?: number; metadata?: Record<string, string | number | boolean | null>; severity?: LogSeverity } = {}): SerialLogEntry {
    const now = Date.now();
    const entry: SerialLogEntry = {
      id: `${now}-${Math.random().toString(36).slice(2, 11)}`,
      timestamp: formatTimestamp(), rawTime: now, text, type,
      severity: options.severity || severityFor(type), event: options.event,
      operationId: options.operationId, metadata: options.metadata,
    };
    this.logs.push(entry);
    if (this.logs.length > this.maxLogs) this.logs.splice(0, this.logs.length - this.maxLogs);
    this.notify(entry);
    return entry;
  }

  public clear(): void {
    this.logs = [];
    this.addLog('--- Console cleared ---', 'system', { event: 'console.cleared' });
  }

  public subscribe(listener: LogListener): () => void { this.listeners.add(listener); return () => this.listeners.delete(listener); }

  private notify(latest: SerialLogEntry): void {
    const current = [...this.logs];
    this.listeners.forEach((fn) => fn(current, latest));
  }

  public exportLogsAsText(): void {
    if (this.logs.length === 0) return;
    const content = this.logs.map((entry) => `${entry.timestamp} [${entry.type.toUpperCase()}] ${entry.text}`).join('\n');
    this.download(content, 'text/plain;charset=utf-8', `esp32_programmer_log_${new Date().toISOString().replace(/[:.]/g, '-')}.txt`);
  }

  public exportLogsAsJson(): void {
    if (this.logs.length === 0) return;
    const payload = JSON.stringify({ schema: 'homspy-cam.audit-log.v1', sessionId: this.sessionId, exportedAt: new Date().toISOString(), entries: this.logs }, null, 2);
    this.download(payload, 'application/json;charset=utf-8', `esp32_programmer_audit_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  }

  private download(content: string, type: string, filename: string): void {
    const blob = new Blob([content], { type });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = filename;
    document.body.appendChild(link); link.click(); link.remove();
    URL.revokeObjectURL(url);
  }
}

export const logService = new LogService();
