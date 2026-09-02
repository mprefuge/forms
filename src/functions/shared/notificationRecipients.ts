/**
 * Notification recipient allowlisting.
 *
 * Form submissions and client-supplied form configs can name notification
 * recipients. Because the API is anonymous, honoring arbitrary recipients
 * would turn the app into an open relay. Recipients are therefore only
 * accepted when their domain is on the allowlist.
 *
 * Allowed recipients come from:
 *   - NOTIFICATION_EMAIL_ALLOWED_DOMAINS (comma-separated domains)
 *   - NOTIFICATION_EMAIL_ALLOWED_ADDRESSES (comma-separated exact addresses,
 *     for recipients on shared providers such as gmail.com)
 *   - the domain(s) of ADMIN_EMAIL / AdminEmail
 *   - the domain of EMAIL_FROM
 */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function parseEmailList(value: any): string[] {
  if (Array.isArray(value)) {
    return value.flatMap((entry) => parseEmailList(entry));
  }
  if (typeof value !== 'string') return [];
  return value
    .split(/[;,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function domainOf(email: string): string | null {
  const at = email.lastIndexOf('@');
  if (at < 0) return null;
  return email.slice(at + 1).trim().toLowerCase();
}

export function getAllowedNotificationDomains(): Set<string> {
  const domains = new Set<string>();

  const configured = (process.env.NOTIFICATION_EMAIL_ALLOWED_DOMAINS || '')
    .split(/[;,\s]+/)
    .map((d) => d.trim().toLowerCase().replace(/^@/, ''))
    .filter(Boolean);
  configured.forEach((d) => domains.add(d));

  parseEmailList(process.env.AdminEmail || process.env.ADMIN_EMAIL).forEach((addr) => {
    const d = domainOf(addr);
    if (d) domains.add(d);
  });

  const from = (process.env.EMAIL_FROM || process.env.SMTP_FROM || '').trim();
  const fromDomain = from ? domainOf(from) : null;
  if (fromDomain) domains.add(fromDomain);

  return domains;
}

export function getAllowedNotificationAddresses(): Set<string> {
  return new Set(
    parseEmailList(process.env.NOTIFICATION_EMAIL_ALLOWED_ADDRESSES)
      .map((addr) => addr.toLowerCase())
      .filter((addr) => EMAIL_PATTERN.test(addr))
  );
}

export interface RecipientFilterResult {
  allowed: string[];
  rejected: string[];
}

/**
 * Keep only syntactically valid recipients that are allowlisted, either by
 * exact address or by domain.
 */
export function filterAllowedRecipients(candidates: string[]): RecipientFilterResult {
  const allowedDomains = getAllowedNotificationDomains();
  const allowedAddresses = getAllowedNotificationAddresses();
  const allowed: string[] = [];
  const rejected: string[] = [];

  for (const raw of candidates) {
    const addr = String(raw || '').trim();
    if (!addr) continue;
    const domain = domainOf(addr);
    const permitted =
      EMAIL_PATTERN.test(addr) &&
      !!domain &&
      (allowedDomains.has(domain) || allowedAddresses.has(addr.toLowerCase()));
    if (!permitted) {
      rejected.push(addr);
      continue;
    }
    if (!allowed.some((a) => a.toLowerCase() === addr.toLowerCase())) {
      allowed.push(addr);
    }
  }

  return { allowed, rejected };
}
