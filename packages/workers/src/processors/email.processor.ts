import { Job } from 'bullmq';
import { ResendService } from '../services/resend.service';
import { EmailJobData } from '@syncflow/shared';


// Gera um template de e-mail HTML premium e responsivo
export function buildHtmlTemplate(templateId: string, subject: string, variables: Record<string, string>): string {
  const brandColor = '#0f172a'; // Slate-900
  const accentColor = '#3b82f6'; // Blue-500

  const header = `
    <div style="background-color: ${brandColor}; padding: 32px; text-align: center; border-radius: 8px 8px 0 0;">
      <h1 style="color: #ffffff; margin: 0; font-family: system-ui, -apple-system, sans-serif; font-size: 24px; font-weight: 700; letter-spacing: -0.03em;">Syncflow</h1>
    </div>
  `;

  const footer = `
    <div style="text-align: center; margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-family: system-ui, -apple-system, sans-serif; font-size: 12px; color: #64748b;">
      <p style="margin: 0 0 8px 0;">Este é um e-mail automático enviado pelo Syncflow. Por favor, não responda diretamente.</p>
      <p style="margin: 0;">&copy; ${new Date().getFullYear()} Syncflow. Todos os direitos reservados.</p>
    </div>
  `;

  let content = '';

  if (templateId === 'PAYMENT_PENDING_PIX') {
    const userName = variables.userName || 'Participante';
    const pixQrCode = variables.pixQrCode || '';
    const amount = variables.amount || '0.00';

    content = `
      <div style="font-family: system-ui, -apple-system, sans-serif; color: #334155; line-height: 1.6; font-size: 16px;">
        <h2 style="color: #0f172a; font-size: 20px; font-weight: 600; margin-top: 0;">Olá, ${userName}!</h2>
        <p>Sua inscrição foi reservada com sucesso. Para confirmar sua participação, realize o pagamento via PIX no valor de <strong>R$ ${amount}</strong>.</p>
        <p style="margin-bottom: 16px;">Utilize o código PIX Copia e Cola abaixo para efetuar o pagamento:</p>
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 16px; word-break: break-all; font-family: monospace; font-size: 14px; color: #0f172a; margin-bottom: 24px;">
          ${pixQrCode}
        </div>
        <p style="font-size: 14px; color: #64748b;">Atenção: O código PIX possui prazo de expiração. Certifique-se de realizar o pagamento para garantir sua vaga.</p>
      </div>
    `;
  } else if (templateId === 'REGISTRATION_CONFIRMED') {
    const userName = variables.userName || 'Participante';
    const eventName = variables.eventName || 'Evento';

    content = `
      <div style="font-family: system-ui, -apple-system, sans-serif; color: #334155; line-height: 1.6; font-size: 16px;">
        <h2 style="color: #0f172a; font-size: 20px; font-weight: 600; margin-top: 0;">Olá, ${userName}!</h2>
        <p>Grandes notícias! Seu pagamento foi confirmado e sua inscrição para o evento <strong>${eventName}</strong> está oficialmente <strong>CONFIRMADA</strong>!</p>
        <p>Prepare-se para uma experiência incrível. Em breve enviaremos mais detalhes sobre o evento e o credenciamento.</p>
        <div style="margin-top: 24px; text-align: center;">
          <a href="#" style="background-color: ${accentColor}; color: #ffffff; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: 600; display: inline-block;">Ver Detalhes do Evento</a>
        </div>
      </div>
    `;
  } else if (templateId === 'REGISTRATION_EXPIRED') {
    const userName = variables.userName || 'Participante';
    const eventName = variables.eventName || 'Evento';

    content = `
      <div style="font-family: system-ui, -apple-system, sans-serif; color: #334155; line-height: 1.6; font-size: 16px;">
        <h2 style="color: #ef4444; font-size: 20px; font-weight: 600; margin-top: 0;">Inscrição Expirada</h2>
        <p>Olá, ${userName},</p>
        <p>O prazo para o pagamento da sua inscrição no evento <strong>${eventName}</strong> expirou e a reserva foi cancelada.</p>
        <p>Caso ainda tenha interesse em participar, verifique a disponibilidade de vagas e realize uma nova inscrição.</p>
      </div>
    `;
  } else if (templateId === 'REGISTRATION_REFUNDED') {
    const userName = variables.userName || 'Participante';
    const eventName = variables.eventName || 'Evento';

    content = `
      <div style="font-family: system-ui, -apple-system, sans-serif; color: #334155; line-height: 1.6; font-size: 16px;">
        <h2 style="color: #0f172a; font-size: 20px; font-weight: 600; margin-top: 0;">Inscrição Reembolsada</h2>
        <p>Olá, ${userName},</p>
        <p>Sua inscrição no evento <strong>${eventName}</strong> foi cancelada e o valor pago foi estornado com sucesso.</p>
        <p>O reembolso será processado de acordo com a forma original de pagamento. Em caso de dúvidas, entre em contato com a organização do evento.</p>
      </div>
    `;
  } else {
    // Fallback genérico
    const userName = variables.userName || 'Participante';
    const fields = Object.entries(variables)
      .filter(([key]) => key !== 'userName')
      .map(([key, val]) => `<p><strong>${key}:</strong> ${val}</p>`)
      .join('');

    content = `
      <div style="font-family: system-ui, -apple-system, sans-serif; color: #334155; line-height: 1.6; font-size: 16px;">
        <h2 style="color: #0f172a; font-size: 20px; font-weight: 600; margin-top: 0;">Notificação Syncflow</h2>
        <p>Olá, ${userName}.</p>
        ${fields}
      </div>
    `;
  }

  return `
    <!DOCTYPE html>
    <html>
      <head>
        <meta charset="utf-8">
        <title>${subject}</title>
      </head>
      <body style="background-color: #f1f5f9; padding: 24px; margin: 0;">
        <div style="max-width: 600px; margin: 0 auto; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); border: 1px solid #e2e8f0;">
          ${header}
          <div style="padding: 32px;">
            ${content}
            ${footer}
          </div>
        </div>
      </body>
    </html>
  `;
}

// Processador encarregado de enviar e-mails reais usando o Resend Service
export async function processEmail(job: Job<EmailJobData>): Promise<void> {
  const { to, subject, templateId, variables } = job.data;

  // Constrói o HTML com base no template e variáveis
  const html = buildHtmlTemplate(templateId, subject, variables);

  const resendService = new ResendService();
  // Envia via Resend
  await resendService.sendEmail(to, subject, html);
}
