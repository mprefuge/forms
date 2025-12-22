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

  async sendApplicationCode(toEmail: string, formCode: string): Promise<void> {
    if (!toEmail || !formCode) throw new Error('Invalid parameters for sendApplicationCode');

    const subject = 'Your Refuge International Application Code';
    // Normalize code to uppercase for readability in email
    const codeToSend = String(formCode).toUpperCase();

    const text = `Hello,\n\nWe received a request to retrieve your application code for Refuge International. Your application code is: ${codeToSend}\n\nYou can use this code to resume your application at our website. If you did not request this email, please ignore it.\n\nBlessings,\nRefuge International`;
    const html = `<p>Hello,</p><p>We received a request to retrieve your application code for Refuge International. <strong>Your application code is: <code>${codeToSend}</code></strong></p><p>You can use this code to resume your application at our website. If you did not request this email, please ignore it.</p><p>Blessings,<br/>Refuge International</p>`;

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
      const message = {
        // Include multiple variants for the sender field to be compatible across SDK versions
        sender: from,
        senderAddress: from,
        from,
        content: { subject, plainText: text, html },
        // Some SDK versions expect `address` and others `email` as the recipient key; include both for compatibility
        recipients: { to: [{ address: toEmail, email: toEmail }] },
      };

      if (process.env.NODE_ENV !== 'production') {
        console.debug('ACS send details', { connectionStringSet: !!conn, from, toEmail, messageShape: Object.keys(message) });
      }

      try {
        // SDK may differ in exact method; prefer send if available
        if (typeof client.send === 'function') {
          await client.send(message);
        } else if (typeof client.sendEmail === 'function') {
          await client.sendEmail(message);
        } else if (typeof client.beginSend === 'function') {
          // beginSend returns a poller
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
}
