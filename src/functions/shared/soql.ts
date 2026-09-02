/**
 * SOQL safety helpers.
 *
 * Values are interpolated into SOQL string literals, so both backslashes and
 * single quotes must be escaped (SOQL treats "\\" as a literal backslash, so
 * escaping only the quote lets a trailing backslash break out of the string).
 *
 * Identifiers (object and field names) cannot be escaped at all, so they are
 * validated against a strict allowlist pattern instead.
 */

const IDENTIFIER_PATTERN = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;

export function escapeSoqlString(value: any): string {
  return String(value ?? '')
    .replace(/\\/g, '\\\\')
    .replace(/'/g, "\\'")
    .replace(/\r/g, '\\r')
    .replace(/\n/g, '\\n');
}

export function isSafeSoqlIdentifier(name: any): boolean {
  return typeof name === 'string' && IDENTIFIER_PATTERN.test(name);
}

export function assertSafeSoqlIdentifier(name: any, label: string = 'field'): string {
  if (!isSafeSoqlIdentifier(name)) {
    throw new Error(`Invalid ${label} name: ${String(name).slice(0, 80)}`);
  }
  return name as string;
}

/**
 * Validate a list of field names, returning the trimmed, de-duplicated list.
 * Throws when any entry is not a plain identifier (dotted relationship paths
 * such as Owner.Email are intentionally rejected).
 */
export function assertSafeFieldList(fields: any, label: string = 'field'): string[] {
  if (!Array.isArray(fields)) return [];
  const out: string[] = [];
  for (const raw of fields) {
    if (raw === undefined || raw === null || raw === '') continue;
    const name = typeof raw === 'string' ? raw.trim() : raw;
    assertSafeSoqlIdentifier(name, label);
    if (!out.includes(name)) out.push(name);
  }
  return out;
}
