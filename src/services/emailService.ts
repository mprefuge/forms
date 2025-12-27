export interface EmailServiceConfig {
  smtpHost?: string;
  smtpPort?: number;
  smtpUser?: string;
  smtpPass?: string;
  fromAddress?: string;
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

  async sendApplicationCode(toEmail: string, formCode: string): Promise<void> {
    if (!toEmail || !formCode) throw new Error('Invalid parameters for sendApplicationCode');

    const subject = 'Your Application Code';
    // Normalize code to uppercase for readability in email
    const codeToSend = String(formCode).toUpperCase();

    const text = `Hello,\n\nWe received a request to retrieve your application code. Your application code is: ${codeToSend}\n\nYou can use this code to resume your application at our website. If you did not request this email, please ignore it.\n\nThank you`;
    const html = `<p>Hello,</p><p>We received a request to retrieve your application code. <strong>Your application code is: <code>${codeToSend}</code></strong></p><p>You can use this code to resume your application at our website. If you did not request this email, please ignore it.</p><p>Thank you</p>`;

    await this.sendRawEmail(toEmail, subject, text, html);
  }

  async sendApplicationCopy(toEmail: string, applicantName: string, formData: any, formConfig?: any): Promise<void> {
    if (!toEmail) throw new Error('Missing recipient email');

    // Get organization name from form config or use generic text
    const orgName = (formConfig && formConfig.terms && formConfig.terms.orgName) || 'our organization';

    // New behavior: short confirmation email with optional application code
    const subject = `Your ${orgName} Application Submission`;
    const code = (formData && (formData.FormCode__c || formData.formCode || formData.FormCode || formData.form_code)) ? String(formData.FormCode__c || formData.formCode || formData.FormCode || formData.form_code) : undefined;

    const text = `Hello ${applicantName || ''},\n\nThank you — your application has been successfully submitted. You can monitor its progress by navigating to the application page and selecting "Check Progress", then entering your application code${code ? `: ${code.toUpperCase()}` : '.'}\n\nIf you cannot locate your application code, use the "Forgot your code?" link on the application page.\n\nThank you,\n${orgName}`;

    const html = `<p>Hello ${applicantName || ''},</p><p>Thank you — your application has been <strong>successfully submitted</strong>. You can monitor its progress by navigating to the application page and selecting <strong>Check Progress</strong>, then entering your application code${code ? `: <strong>${code.toUpperCase()}</strong>` : '.'}</p><p>If you cannot locate your application code, use the <em>Forgot your code?</em> link on the application page.</p><p>Thank you,<br/>${orgName}</p>`;

    await this.sendRawEmail(toEmail, subject, text, html);
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

  // Send a concise event registration confirmation with calendar links
  async sendEventRegistrationConfirmation(toEmail: string, attendeeName: string, eventInfo: any, formCode?: string): Promise<void> {
    if (!toEmail) throw new Error('Missing recipient email');
    if (!eventInfo || !eventInfo.name) throw new Error('Missing event information');

    const orgName = (eventInfo.orgName) || 'our organization';
    const subject = `Registration Confirmed: ${eventInfo.name}`;

    // Prepare start/end in calendar format
    const start = this._formatDateTimeForCalendar(eventInfo.startDate, eventInfo.startTime);
    const end = this._formatDateTimeForCalendar(eventInfo.endDate, eventInfo.endTime) || start;

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

    if (start) icsLines.push(`DTSTART:${start}`);
    if (end) icsLines.push(`DTEND:${end}`);
    icsLines.push(`SUMMARY:${(eventInfo.name || '').replace(/\n/g, '\\n')}`);
    if (eventInfo.description) icsLines.push(`DESCRIPTION:${(eventInfo.description || '').replace(/\n/g, '\\n')}`);
    if (eventInfo.location) icsLines.push(`LOCATION:${(eventInfo.location || '').replace(/\n/g, '\\n')}`);
    icsLines.push('END:VEVENT', 'END:VCALENDAR');

    const ics = icsLines.join('\r\n');
    const icsDataUri = `data:text/calendar;charset=utf-8,${encodeURIComponent(ics)}`;

    // Google Calendar link
    const gcStart = start || '';
    const gcEnd = end || '';
    const gcParams = new URLSearchParams({
      action: 'TEMPLATE',
      text: eventInfo.name || '',
      details: eventInfo.description || '',
      location: eventInfo.location || '',
      dates: gcStart && gcEnd ? `${gcStart}/${gcEnd}` : undefined,
    } as any);
    const googleUrl = `https://calendar.google.com/calendar/render?${gcParams.toString()}`;

    const text = `Hello ${attendeeName || ''},\n\nThank you — your registration for ${eventInfo.name} has been confirmed.${formCode ? ` Your confirmation code is: ${String(formCode).toUpperCase()}` : ''}\n\nEvent details:\n${eventInfo.startDate ? `When: ${eventInfo.startDate}${eventInfo.startTime ? ' ' + eventInfo.startTime : ''}\n` : ''}${eventInfo.location ? `Where: ${eventInfo.location}\n` : ''}${eventInfo.description ? `Notes: ${eventInfo.description}\n` : ''}\nTo add this event to your calendar, use the following link: ${googleUrl}\n\nThank you,\n${orgName}`;

    const htmlParts = [`<p>Hello ${attendeeName || ''},</p><p>Thank you — your registration for <strong>${eventInfo.name}</strong> has been confirmed.${formCode ? ` Your confirmation code is: <strong>${String(formCode).toUpperCase()}</strong>` : ''}</p>`];
    const details = [];
    if (eventInfo.startDate) details.push(`<div><strong>When:</strong> ${eventInfo.startDate}${eventInfo.startTime ? ' ' + eventInfo.startTime : ''}</div>`);
    if (eventInfo.location) details.push(`<div><strong>Where:</strong> ${eventInfo.location}</div>`);
    if (eventInfo.description) details.push(`<div><strong>Notes:</strong><br/>${(eventInfo.description || '').replace(/\n/g, '<br/>')}</div>`);

    htmlParts.push(`<div>${details.join('')}</div>`);
    htmlParts.push(`<p><a href="${googleUrl}" target="_blank">Add to Google Calendar</a> | <a href="${icsDataUri}" download="event.ics">Download .ics</a></p>`);
    htmlParts.push(`<p>Thank you,<br/>${orgName}</p>`);

    const html = htmlParts.join('');

    await this.sendRawEmail(toEmail, subject, text, html);
  }
}
