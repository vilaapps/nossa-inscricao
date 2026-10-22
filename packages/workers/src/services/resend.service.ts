import { Resend } from 'resend';

export interface EmailAttachment {
  filename: string;
  content: string; // Base64 ou buffer string
}

export class ResendService {
  private readonly globalResend: Resend;
  private readonly defaultFrom: string;

  constructor(apiKey?: string, defaultFrom?: string) {
    const key = apiKey ?? process.env.RESEND_API_KEY ?? 'mock-key';
    this.globalResend = new Resend(key);
    this.defaultFrom = defaultFrom ?? process.env.RESEND_FROM_EMAIL ?? 'onboarding@resend.dev';
  }

  // Envia um e-mail com templates HTML customizados e anexos opcionais
  async sendEmail(
    to: string,
    subject: string,
    html: string,
    customApiKey?: string,
    from?: string,
    attachments?: EmailAttachment[],
  ): Promise<{ id: string }> {
    const resendClient = customApiKey ? new Resend(customApiKey) : this.globalResend;
    const sender = from ?? this.defaultFrom;

    const payload: any = {
      from: sender,
      to,
      subject,
      html,
    };

    if (attachments && attachments.length > 0) {
      payload.attachments = attachments.map((att) => ({
        filename: att.filename,
        content: att.content,
      }));
    }

    const response = await resendClient.emails.send(payload);

    if (response.error) {
      throw new Error(`Failed to send email: ${response.error.message}`);
    }

    return { id: response.data?.id ?? '' };
  }
}
