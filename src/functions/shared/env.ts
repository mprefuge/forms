/**
 * Environment helpers.
 *
 * Azure Functions does not set NODE_ENV automatically, so anything that
 * relaxes security or verbosity must be opted into explicitly. Production
 * behavior is the default; development behavior requires NODE_ENV to be
 * "development" or "test".
 */

export function isDevelopment(): boolean {
  const env = (process.env.NODE_ENV || '').trim().toLowerCase();
  return env === 'development' || env === 'test';
}

export function isDebugLoggingEnabled(): boolean {
  const level = (process.env.LOG_LEVEL || '').trim().toLowerCase();
  if (level === 'debug' || level === 'trace' || level === 'verbose') return true;
  return isDevelopment();
}
