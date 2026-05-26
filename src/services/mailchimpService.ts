import axios from 'axios';
import crypto from 'crypto';

export interface MailchimpServiceConfig {
  apiKey?: string;
  serverPrefix?: string;
  audienceId?: string;
  enabled?: boolean;
  timeoutMs?: number;
  defaultTags?: string[];
  doubleOptIn?: boolean;
}

export interface MailchimpSubscriber {
  email: string;
  firstName?: string;
  lastName?: string;
  tags?: string[];
}

export class MailchimpService {
  private config: MailchimpServiceConfig;

  constructor(config?: MailchimpServiceConfig) {
    const apiKey = config?.apiKey ?? process.env.MAILCHIMP_API_KEY;
    this.config = {
      apiKey,
      serverPrefix: config?.serverPrefix ?? process.env.MAILCHIMP_SERVER_PREFIX ?? this.extractServerPrefix(apiKey),
      audienceId: config?.audienceId ?? process.env.MAILCHIMP_AUDIENCE_ID,
      enabled: config?.enabled ?? true,
      timeoutMs: config?.timeoutMs ?? 10000,
      defaultTags: config?.defaultTags ?? this.parseTags(process.env.MAILCHIMP_TAGS),
      doubleOptIn: config?.doubleOptIn ?? this.parseBoolean(process.env.MAILCHIMP_DOUBLE_OPT_IN),
    };
  }

  private parseBoolean(value: any): boolean {
    if (typeof value === 'boolean') return value;
    if (typeof value !== 'string') return false;
    return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
  }

  private parseTags(value?: string): string[] {
    if (!value) return [];
    return value
      .split(',')
      .map((tag) => tag.trim())
      .filter(Boolean);
  }

  private extractServerPrefix(apiKey?: string): string | undefined {
    if (!apiKey) return undefined;
    const idx = apiKey.lastIndexOf('-');
    if (idx < 0 || idx === apiKey.length - 1) return undefined;
    return apiKey.slice(idx + 1);
  }

  isConfigured(): boolean {
    return !!(
      this.config.enabled &&
      this.config.apiKey &&
      this.config.serverPrefix &&
      this.config.audienceId
    );
  }

  private getAuthHeader(): string {
    const token = Buffer.from(`anystring:${this.config.apiKey || ''}`).toString('base64');
    return `Basic ${token}`;
  }

  private buildMemberHash(email: string): string {
    return crypto.createHash('md5').update(email.trim().toLowerCase()).digest('hex');
  }

  async upsertSubscriber(subscriber: MailchimpSubscriber): Promise<void> {
    if (!this.isConfigured()) {
      return;
    }

    const email = (subscriber.email || '').trim().toLowerCase();
    if (!email) {
      return;
    }

    const memberHash = this.buildMemberHash(email);
    const url = `https://${this.config.serverPrefix}.api.mailchimp.com/3.0/lists/${this.config.audienceId}/members/${memberHash}`;

    const tags = [
      ...(this.config.defaultTags || []),
      ...((subscriber.tags || []).map((tag) => String(tag).trim()).filter(Boolean)),
    ];

    const shouldUsePending = !!this.config.doubleOptIn;

    const payload: any = {
      email_address: email,
      status_if_new: shouldUsePending ? 'pending' : 'subscribed',
      status: shouldUsePending ? 'pending' : 'subscribed',
      merge_fields: {
        FNAME: subscriber.firstName || '',
        LNAME: subscriber.lastName || '',
      },
      update_existing: true,
    };

    if (tags.length > 0) {
      payload.tags = Array.from(new Set(tags));
    }

    await axios.put(url, payload, {
      headers: {
        Authorization: this.getAuthHeader(),
        'Content-Type': 'application/json',
      },
      timeout: this.config.timeoutMs,
    });
  }
}
