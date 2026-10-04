import { sanitizeObject, sanitizeString } from '../security/sanitizer.js';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  timestamp: string;
  level: LogLevel;
  message: string;
  context?: string;
  correlationId?: string;
  data?: unknown;
}

export class Logger {
  private context?: string;
  private correlationId?: string;

  constructor(context?: string, correlationId?: string) {
    this.context = context;
    this.correlationId = correlationId;
  }

  withContext(context: string): Logger {
    return new Logger(context, this.correlationId);
  }

  withCorrelationId(correlationId: string): Logger {
    return new Logger(this.context, correlationId);
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    const entry: LogEntry = {
      timestamp: new Date().toISOString(),
      level,
      message: sanitizeString(message),
      context: this.context,
      correlationId: this.correlationId,
      data: data !== undefined ? sanitizeObject(data) : undefined,
    };

    const prefix = `[${entry.timestamp}] [${entry.level.toUpperCase()}]${entry.context ? ` [${entry.context}]` : ''}${entry.correlationId ? ` [${entry.correlationId}]` : ''}:`;

    switch (level) {
      case 'debug':
        if (process.env.DEBUG || process.env.NODE_ENV === 'development') {
          console.debug(prefix, entry.message, entry.data || '');
        }
        break;
      case 'info':
        console.log(prefix, entry.message, entry.data || '');
        break;
      case 'warn':
        console.warn(prefix, entry.message, entry.data || '');
        break;
      case 'error':
        console.error(prefix, entry.message, entry.data || '');
        break;
    }
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }
}

export const logger = new Logger('Nexus');
