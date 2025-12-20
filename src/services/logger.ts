import { v4 as uuidv4 } from 'uuid';

export class Logger {
  private requestId: string;
  private invocationId?: string;

  constructor(requestId?: string, invocationId?: string) {
    this.requestId = requestId || uuidv4();
    this.invocationId = invocationId;
  }

  getRequestId(): string {
    return this.requestId;
  }

  info(message: string, context?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'INFO',
      requestId: this.requestId,
      invocationId: this.invocationId,
      message,
      context: this.maskSensitiveData(context),
    };
    console.log(JSON.stringify(logEntry));
  }

  error(message: string, error?: any, context?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'ERROR',
      requestId: this.requestId,
      invocationId: this.invocationId,
      message,
      error: error?.message || error,
      context: this.maskSensitiveData(context),
    };
    console.error(JSON.stringify(logEntry));
  }

  debug(message: string, context?: any): void {
    const logEntry = {
      timestamp: new Date().toISOString(),
      level: 'DEBUG',
      requestId: this.requestId,
      invocationId: this.invocationId,
      message,
      context: this.maskSensitiveData(context),
    };
    console.log(JSON.stringify(logEntry));
  }

  private maskSensitiveData(data?: any): any {
    if (!data) return undefined;

    if (typeof data !== 'object') return data;

    const masked = { ...data };
    const sensitiveFields = ['SF_CLIENT_SECRET', 'clientSecret', 'password', 'token'];

    for (const field of sensitiveFields) {
      if (field in masked) {
        masked[field] = '***MASKED***';
      }
    }

    return masked;
  }
}
