import { randomUUID } from 'crypto';
import { isDebugLoggingEnabled } from '../functions/shared/env';

const SECRET_KEY_PATTERN = /secret|password|passwd|token|accesskey|access_key|apikey|api_key|authorization|cookie|connectionstring|connection_string/i;
const EMAIL_KEY_PATTERN = /email|^to$|^from$|recipient|^cc$|^bcc$/i;
const PHONE_KEY_PATTERN = /phone|mobile/i;
const REDACTED_KEY_PATTERN = /^headers$|^rawbody$|^stack$/i;
const MAX_DEPTH = 4;

export function maskEmail(value: string): string {
  const str = String(value);
  const at = str.indexOf('@');
  if (at <= 0) return str.length > 0 ? '***' : str;
  const local = str.slice(0, at);
  const domain = str.slice(at + 1);
  const visible = local.slice(0, Math.min(2, local.length));
  return `${visible}***@${domain}`;
}

function maskValueForKey(key: string, value: any): any {
  if (value === undefined || value === null) return value;
  if (SECRET_KEY_PATTERN.test(key)) return '***MASKED***';
  if (REDACTED_KEY_PATTERN.test(key)) return '[redacted]';
  if (EMAIL_KEY_PATTERN.test(key)) {
    if (typeof value === 'string') return maskEmail(value);
    if (Array.isArray(value)) return value.map((v) => (typeof v === 'string' ? maskEmail(v) : v));
  }
  if (PHONE_KEY_PATTERN.test(key) && (typeof value === 'string' || typeof value === 'number')) {
    const digits = String(value).replace(/\D/g, '');
    return digits.length > 4 ? `***${digits.slice(-4)}` : '***';
  }
  return undefined;
}

/**
 * Recursively mask secrets and personal data in a log context object.
 * Exported for tests and for callers that build their own log lines.
 */
export function maskSensitiveData(data?: any, depth: number = 0): any {
  if (data === undefined || data === null) return data;
  if (typeof data !== 'object') return data;
  if (depth >= MAX_DEPTH) return '[truncated]';

  if (Array.isArray(data)) {
    return data.map((item) => maskSensitiveData(item, depth + 1));
  }

  if (data instanceof Error) {
    return { name: data.name, message: data.message };
  }

  const masked: any = {};
  for (const [key, value] of Object.entries(data)) {
    const replaced = maskValueForKey(key, value);
    if (replaced !== undefined) {
      masked[key] = replaced;
    } else if (value && typeof value === 'object') {
      masked[key] = maskSensitiveData(value, depth + 1);
    } else {
      masked[key] = value;
    }
  }
  return masked;
}

export class Logger {
  private requestId: string;
  private invocationId?: string;

  constructor(requestId?: string, invocationId?: string) {
    this.requestId = requestId || randomUUID();
    this.invocationId = invocationId;
  }

  getRequestId(): string {
    return this.requestId;
  }

  info(message: string, context?: any): void {
    console.log(JSON.stringify(this.entry('INFO', message, context)));
  }

  error(message: string, error?: any, context?: any): void {
    const logEntry: any = this.entry('ERROR', message, context);
    logEntry.error = error?.message || (typeof error === 'string' ? error : undefined) || (error ? maskSensitiveData(error) : undefined);
    console.error(JSON.stringify(logEntry));
  }

  debug(message: string, context?: any): void {
    if (!isDebugLoggingEnabled()) return;
    console.log(JSON.stringify(this.entry('DEBUG', message, context)));
  }

  private entry(level: string, message: string, context?: any): any {
    return {
      timestamp: new Date().toISOString(),
      level,
      requestId: this.requestId,
      invocationId: this.invocationId,
      message,
      context: maskSensitiveData(context),
    };
  }
}
