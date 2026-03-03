import { HttpRequest } from '@azure/functions';

export function getFirstQueryValue(request: HttpRequest, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = request.query.get(key);
    if (value !== null && value !== undefined) {
      return value;
    }
  }
  return undefined;
}

export function getTrimmedQueryValue(request: HttpRequest, key: string): string | undefined {
  const value = request.query.get(key);
  if (value === null || value === undefined) {
    return undefined;
  }
  return `${value}`.trim();
}

export function getTrimmedFirstQueryValue(request: HttpRequest, keys: string[]): string | undefined {
  const value = getFirstQueryValue(request, keys);
  if (value === null || value === undefined) {
    return undefined;
  }
  return `${value}`.trim();
}

export function isTruthyQueryFlag(value: string | undefined): boolean {
  if (!value) return false;
  const v = value.toLowerCase();
  return value === '1' || v === 'true' || v === 'yes';
}

export function parseJsonFromQuery(value: string | undefined): any | undefined {
  if (!value) return undefined;
  return JSON.parse(value);
}

export function parseDecodedJsonFromQuery(value: string | undefined): any | undefined {
  if (!value) return undefined;
  return JSON.parse(decodeURIComponent(value));
}