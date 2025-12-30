export interface EmailServiceConfig {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  fromAddress?: string;
}

export interface EmailTemplate {
  subject: string;
  text: string;
  html: string;
}

export interface EmailVariables {
  [key: string]: string | number | boolean | undefined;
}

/**
 * EmailService supports two providers:
 * 1) Azure Communication Services Email - enabled when AZURE_COMMUNICATION_CONNECTION_STRING is set
 * 2) SMTP (nodemailer) - fallback when SMTP_* vars are provided
 */
export class EmailService {
  private config: EmailServiceConfig;

  constructor(config?: EmailServiceConfig) {
    this.config = config || {
      smtpHost: process.env.SMTP_HOST,
      smtpPort: process.env.SMTP_PORT ? Number(process.env.SMTP_PORT) : undefined,
      smtpUser: process.env.SMTP_USER,
      smtpPass: process.env.SMTP_PASS,
      fromAddress: process.env.EMAIL_FROM || process.env.SMTP_FROM || 'no-reply@example.com',
    };
  }

  private validateSmtpConfig() {
    const { smtpHost, smtpPort, smtpUser, smtpPass } = this.config;
    if (!smtpHost || !smtpPort || !smtpUser || !smtpPass) {
      throw new Error('Missing SMTP configuration for sending emails');
    }
  }

  private hasAzureConfig(): boolean {
    return !!(process.env.AZURE_COMMUNICATION_CONNECTION_STRING || process.env.AZURE_EMAIL_CONNECTION_STRING);
  }

  private async sendRawEmail(toEmail: string, subject: string, text: string, html: string): Promise<void> {
    if (!toEmail || !subject) throw new Error('Invalid parameters for sendRawEmail');

    // Use Azure Communication Services Email when configured
    if (this.hasAzureConfig()) {
      const conn = process.env.AZURE_COMMUNICATION_CONNECTION_STRING || process.env.AZURE_EMAIL_CONNECTION_STRING || '';
      let AzureModule: any;
      try {
        AzureModule = require('@azure/communication-email');
      } catch (err) {
        throw new Error('Azure Communication Email SDK is not available in this environment');
      }

      const EmailClient = AzureModule.EmailClient || AzureModule.default?.EmailClient;
      if (!EmailClient) throw new Error('Azure Communication EmailClient not found in SDK');

      const client = new EmailClient(conn);
      const from = this.config.fromAddress || process.env.EMAIL_FROM || 'no-reply@example.com';
      const message: any = {
        sender: from,
        senderAddress: from,
        from,
        content: { subject, plainText: text, html },
        recipients: { to: [{ address: toEmail, email: toEmail }] },
      };

      if (process.env.NODE_ENV !== 'production') {
        console.debug('ACS send details', { connectionStringSet: !!conn, from, toEmail, messageShape: Object.keys(message) });
      }

      try {
        if (typeof client.send === 'function') {
          await client.send(message);
        } else if (typeof client.sendEmail === 'function') {
          await client.sendEmail(message);
        } else if (typeof client.beginSend === 'function') {
          const poller = await client.beginSend(message);
          await poller.pollUntilDone();
        } else {
          throw new Error('No supported send method on Azure EmailClient');
        }
        return;
      } catch (err: any) {
        throw new Error(`Failed to send email via Azure Communication Services: ${err?.message || err}`);
      }
    }

    // Fallback to SMTP using nodemailer
    this.validateSmtpConfig();

    let nodemailer: any;
    try {
      nodemailer = require('nodemailer');
    } catch (err) {
      throw new Error('Nodemailer module is not available in this environment');
    }

    const transporter = nodemailer.createTransport({
      host: this.config.smtpHost,
      port: this.config.smtpPort,
      secure: Number(this.config.smtpPort) === 465,
      auth: {
        user: this.config.smtpUser,
        pass: this.config.smtpPass,
      },
    });

    const from = this.config.fromAddress || 'no-reply@example.com';

    try {
      await transporter.sendMail({ from, to: toEmail, subject, text, html });
    } catch (err: any) {
      throw new Error(`Failed to send email: ${err?.message || err}`);
    }
  }

  /**
   * Send an email with template variable substitution.
   * Variables in the template are replaced using {{variableName}} syntax.
   * Supports nested access like {{data.fieldName}} or direct field names {{fieldName}}.
   * @param toEmail Recipient email address
   * @param template Email template with subject, text, and html
   * @param variables Key-value pairs to substitute in the template
   */
  async sendEmail(toEmail: string, template: EmailTemplate, variables: EmailVariables = {}): Promise<void> {
    if (!toEmail) throw new Error('Missing recipient email');
    if (!template || !template.subject) throw new Error('Invalid email template');

    // Replace variables in template
    // Supports {{variableName}} or {{data.fieldName}} syntax
    const replaceVariables = (str: string): string => {
      return str.replace(/\{\{([\w\.]+)\}\}/g, (match, path) => {
        // Split path by dots to support nested access (e.g., data.FirstName__c)
        const keys = path.split('.');
        let value: any = variables;
        
        for (const key of keys) {
          value = value?.[key];
          if (value === undefined) break;
        }
        
        return value !== undefined ? String(value) : match;
      });
    };

    const subject = replaceVariables(template.subject);
    const text = replaceVariables(template.text);
    const html = replaceVariables(template.html);

    await this.sendRawEmail(toEmail, subject, text, html);
  }

  /**
   * @deprecated Use sendEmail directly with your own template. This method is kept for backward compatibility.
   */
  async sendApplicationCode(toEmail: string, formCode: string, template?: EmailTemplate): Promise<void> {
    if (!toEmail || !formCode) throw new Error('Invalid parameters for sendApplicationCode');
    if (!template) throw new Error('Email template is required. Define the template in the calling function.');

    const codeToSend = String(formCode).toUpperCase();
    await this.sendEmail(toEmail, template, { formCode: codeToSend });
  }

  /**
   * @deprecated Use sendEmail directly with your own template. This method is kept for backward compatibility.
   */
  async sendApplicationCopy(toEmail: string, applicantName: string, formData: any, formConfig?: any, template?: EmailTemplate): Promise<void> {
    if (!toEmail) throw new Error('Missing recipient email');
    if (!template) throw new Error('Email template is required. Define the template in the calling function.');

    const orgName = (formConfig && formConfig.terms && formConfig.terms.orgName) || 'our organization';
    const code = (formData && (formData.FormCode__c || formData.formCode || formData.FormCode || formData.form_code)) ? String(formData.FormCode__c || formData.formCode || formData.FormCode || formData.form_code).toUpperCase() : undefined;

    // Include all formData fields so they can be referenced in templates
    const variables: EmailVariables = {
      ...formData,
      applicantName: applicantName || '',
      orgName,
      codeText: code ? `: ${code}` : '',
      codeHtml: code ? `: <strong>${code}</strong>` : '',
      FormCode__c: code || '',
      // Map Salesforce field names to template-friendly names
      FirstName: formData?.FirstName__c || formData?.FirstName || '',
      LastName: formData?.LastName__c || formData?.LastName || '',
      Email: formData?.Email__c || formData?.Email || '',
      Phone: formData?.Phone__c || formData?.Phone || ''
    };

    await this.sendEmail(toEmail, template, variables);
  }

  // Helper to format Date to Google/ICS friendly strings
  private _formatDateTimeForCalendar(dStr?: string, tStr?: string) {
    if (!dStr) return null;
    try {
      // Combine date and time if provided
      let dt: Date | null = null;
      if (tStr) {
        // Accept times like HH:mm or HH:mm:ss and optionally a timezone indicator
        const trimmed = `${dStr} ${tStr}`.trim();
        const parsed = new Date(trimmed);
        dt = isNaN(parsed.getTime()) ? null : parsed;
      } else {
        const parsed = new Date(dStr);
        dt = isNaN(parsed.getTime()) ? null : parsed;
      }
      if (!dt) return null;
      // UTC form for ICS / Google is YYYYMMDDTHHMMSSZ
      const pad = (v: number) => v.toString().padStart(2, '0');
      const y = dt.getUTCFullYear();
      const m = pad(dt.getUTCMonth() + 1);
      const day = pad(dt.getUTCDate());
      const hh = pad(dt.getUTCHours());
      const mm = pad(dt.getUTCMinutes());
      const ss = pad(dt.getUTCSeconds());
      return `${y}${m}${day}T${hh}${mm}${ss}Z`;
    } catch {
      return null;
    }
  }

  /**
   * Helper to format Date to Google/ICS friendly strings
   */
  formatDateTimeForCalendar(dStr?: string, tStr?: string): string | null {
    return this._formatDateTimeForCalendar(dStr, tStr);
  }

  /**
   * Build a local "floating" date-time in YYYYMMDDTHHMMSS (no timezone conversion, no trailing Z)
   * Interprets dStr as YYYY-MM-DD and tStr as HH:mm[:ss][Z]; ignores any timezone designator.
   */
  private _formatDateTimeLocal(dStr?: string, tStr?: string): string | null {
    if (!dStr) return null;
    try {
      const d = String(dStr).trim();
      const m = d.match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return null;
      const Y = m[1];
      const M = m[2];
      const D = m[3];
      let hh = '00', mm = '00', ss = '00';
      if (tStr) {
        const t = String(tStr).trim().replace(/Z$/i, '');
        const parts = t.split(':');
        if (parts.length >= 1) hh = parts[0].padStart(2, '0');
        if (parts.length >= 2) mm = parts[1].padStart(2, '0');
        if (parts.length >= 3) ss = parts[2].split('.')[0].padStart(2, '0');
      }
      return `${Y}${M}${D}T${hh}${mm}${ss}`;
    } catch {
      return null;
    }
  }

  /**
   * Helper to generate calendar links and data for event emails
   */
  generateEventCalendarData(eventInfo: any): { googleUrl: string; icsDataUri: string; icsUrl: string; outlookUrl: string; appleIcsUrl: string } {
    const orgName = (eventInfo.orgName) || 'our organization';
    const userTz = eventInfo.userTimeZone || eventInfo.timeZone || eventInfo.tz || undefined;
    // Use floating local times so recipients see the provided times in their local zone.
    const startLocal = this._formatDateTimeLocal(eventInfo.startDate, eventInfo.startTime);
    const endLocal = this._formatDateTimeLocal(eventInfo.endDate, eventInfo.endTime) || startLocal;

    // Create ICS content
    const uid = `${Date.now()}@${(this.config.fromAddress || 'no-reply')}`;
    const dtstamp = this._formatDateTimeForCalendar(new Date().toISOString());
    const icsLines = [
      'BEGIN:VCALENDAR',
      'VERSION:2.0',
      `PRODID:-//${orgName}//Event//EN`,
      'CALSCALE:GREGORIAN',
      'BEGIN:VEVENT',
      `UID:${uid}`,
      `DTSTAMP:${dtstamp}`,
    ];

    // Floating local DTSTART/DTEND (no Z) so clients render in user's local time
    if (startLocal) icsLines.push(`DTSTART:${startLocal}`);
    if (endLocal) icsLines.push(`DTEND:${endLocal}`);
    icsLines.push(`SUMMARY:${(eventInfo.name || '').replace(/\n/g, '\\n')}`);
    if (eventInfo.description) icsLines.push(`DESCRIPTION:${(eventInfo.description || '').replace(/\n/g, '\\n')}`);
    if (eventInfo.location) icsLines.push(`LOCATION:${(eventInfo.location || '').replace(/\n/g, '\\n')}`);
    icsLines.push('END:VEVENT', 'END:VCALENDAR');

    const ics = icsLines.join('\r\n');
    const icsDataUri = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;

    // Google Calendar link
    const gcStart = startLocal || '';
    const gcEnd = endLocal || '';
    const gcParams = new URLSearchParams({
      action: 'TEMPLATE',
      text: eventInfo.name || '',
      details: eventInfo.description || '',
      location: eventInfo.location || '',
      dates: gcStart && gcEnd ? `${gcStart}/${gcEnd}` : undefined,
    } as any);
    if (userTz) {
      gcParams.set('ctz', userTz);
    }
    const googleUrl = `https://calendar.google.com/calendar/render?${gcParams.toString()}`;

    // Hosted ICS link (API will serve the file with proper headers)
    const base = (process.env.PUBLIC_BASE_URL
      || (process.env.WEBSITE_HOSTNAME ? `https://${process.env.WEBSITE_HOSTNAME}` : undefined)
      || 'http://localhost:7071').replace(/\/$/, '');
    const icsParams = new URLSearchParams({
      name: eventInfo.name || '',
      startDate: eventInfo.startDate || '',
      endDate: eventInfo.endDate || '',
      startTime: eventInfo.startTime || '',
      endTime: eventInfo.endTime || '',
      description: eventInfo.description || '',
      location: eventInfo.location || '',
      tz: userTz || ''
    } as any);
    const icsUrl = `${base}/api/calendar?${icsParams.toString()}`;

    // Outlook (web) deep link
    const isoLocal = (d?: string, t?: string) => {
      if (!d) return '';
      const m = String(d).trim().match(/^(\d{4})-(\d{2})-(\d{2})/);
      if (!m) return '';
      let hh = '00', mm = '00', ss = '00';
      if (t) {
        const tt = String(t).trim().replace(/Z$/i, '');
        const parts = tt.split(':');
        if (parts.length >= 1) hh = parts[0].padStart(2, '0');
        if (parts.length >= 2) mm = parts[1].padStart(2, '0');
        if (parts.length >= 3) ss = parts[2].split('.')[0].padStart(2, '0');
      }
      return `${m[1]}-${m[2]}-${m[3]}T${hh}:${mm}:${ss}`;
    };
    const outlookParams = new URLSearchParams({
      path: '/calendar/action/compose',
      rru: 'addevent',
      startdt: isoLocal(eventInfo.startDate, eventInfo.startTime),
      enddt: isoLocal(eventInfo.endDate, eventInfo.endTime),
      subject: eventInfo.name || '',
      body: eventInfo.description || '',
      location: eventInfo.location || '',
      allday: 'false'
    } as any);
    const outlookUrl = `https://outlook.live.com/calendar/0/deeplink/compose?${outlookParams.toString()}`;

    // Apple Calendar uses ICS; provide a friendly alias
    const appleIcsUrl = icsUrl;

    return { googleUrl, icsDataUri, icsUrl, outlookUrl, appleIcsUrl };
  }

  /**
   * @deprecated Use sendEmail directly with your own template. This method is kept for backward compatibility.
   */
  async sendEventRegistrationConfirmation(toEmail: string, attendeeName: string, eventInfo: any, formCode?: string, template?: EmailTemplate): Promise<void> {
    if (!toEmail) throw new Error('Missing recipient email');
    if (!eventInfo || !eventInfo.name) throw new Error('Missing event information');
    if (!template) throw new Error('Email template is required. Define the template in the calling function.');

    const orgName = (eventInfo.orgName) || 'our organization';
    const { googleUrl, icsDataUri } = this.generateEventCalendarData(eventInfo);

    // Build event details
    let eventDetailsText = '';
    if (eventInfo.startDate) eventDetailsText += `When: ${eventInfo.startDate}${eventInfo.startTime ? ' ' + eventInfo.startTime : ''}\n`;
    if (eventInfo.location) eventDetailsText += `Where: ${eventInfo.location}\n`;
    if (eventInfo.description) eventDetailsText += `Notes: ${eventInfo.description}\n`;

    const htmlDetails = [];
    if (eventInfo.startDate) htmlDetails.push(`<div><strong>When:</strong> ${eventInfo.startDate}${eventInfo.startTime ? ' ' + eventInfo.startTime : ''}</div>`);
    if (eventInfo.location) htmlDetails.push(`<div><strong>Where:</strong> ${eventInfo.location}</div>`);
    if (eventInfo.description) htmlDetails.push(`<div><strong>Notes:</strong><br/>${(eventInfo.description || '').replace(/\n/g, '<br/>')}</div>`);

    // Include all eventInfo fields so they can be referenced in templates
    const variables: EmailVariables = {
      ...eventInfo,
      attendeeName: attendeeName || '',
      orgName,
      confirmationCode: formCode ? ` Your confirmation code is: ${String(formCode).toUpperCase()}` : '',
      confirmationCodeHtml: formCode ? ` Your confirmation code is: <strong>${String(formCode).toUpperCase()}</strong>` : '',
      eventDetails: eventDetailsText,
      eventDetailsHtml: htmlDetails.join(''),
      eventStartDate: eventInfo.startDate || '',
      eventStartTime: eventInfo.startTime ? ' ' + eventInfo.startTime : '',
      eventLocation: eventInfo.location || '',
      eventDescriptionHtml: (eventInfo.description || '').replace(/\n/g, '<br/>'),
      googleUrl,
      icsDataUri,
      FormCode__c: formCode ? String(formCode).toUpperCase() : ''
    };

    await this.sendEmail(toEmail, template, variables);
  }
}
