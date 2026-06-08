import { describe, it, expect, vi, beforeEach } from 'vitest';
import { processEmail, buildHtmlTemplate } from './email.processor';
import { ResendService } from '../services/resend.service';
import { Job } from 'bullmq';

// Mock do ResendService
vi.mock('../services/resend.service', () => {
  const mockSendEmail = vi.fn().mockResolvedValue({ id: 'email-id' });
  return {
    ResendService: vi.fn().mockImplementation(() => {
      return {
        sendEmail: mockSendEmail,
      };
    }),
  };
});

describe('Email Processor', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  const createMockJob = (data: any) => {
    return {
      data,
    } as Job;
  };

  // deve enviar email com o template de PIX Pendente
  it('should process and send PAYMENT_PENDING_PIX template email', async () => {
    // Arrange
    const job = createMockJob({
      to: 'buyer@test.com',
      subject: 'Inscrição Pendente — PIX',
      templateId: 'PAYMENT_PENDING_PIX',
      tenantId: 'ten_1',
      variables: {
        userName: 'Astro Buyer',
        pixQrCode: 'pix-code-123',
        amount: '199.90',
      },
    });

    // Act
    await processEmail(job);

    // Assert
    const resendInstance = vi.mocked(ResendService).mock.results[0].value;
    expect(resendInstance.sendEmail).toHaveBeenCalledWith(
      'buyer@test.com',
      'Inscrição Pendente — PIX',
      expect.stringContaining('pix-code-123')
    );
    expect(resendInstance.sendEmail).toHaveBeenCalledWith(
      'buyer@test.com',
      'Inscrição Pendente — PIX',
      expect.stringContaining('R$ 199.90')
    );
  });

  // deve enviar email com o template de confirmacao de inscricao
  it('should process and send REGISTRATION_CONFIRMED template email', async () => {
    // Arrange
    const job = createMockJob({
      to: 'buyer@test.com',
      subject: 'Inscrição Confirmada!',
      templateId: 'REGISTRATION_CONFIRMED',
      tenantId: 'ten_1',
      variables: {
        userName: 'Astro Attendee',
        eventName: 'React Conf 2026',
      },
    });

    // Act
    await processEmail(job);

    // Assert
    const resendInstance = vi.mocked(ResendService).mock.results[0].value;
    expect(resendInstance.sendEmail).toHaveBeenCalledWith(
      'buyer@test.com',
      'Inscrição Confirmada!',
      expect.stringContaining('React Conf 2026')
    );
  });

  // deve enviar email com o template de expiracao de inscricao
  it('should process and send REGISTRATION_EXPIRED template email', async () => {
    // Arrange
    const job = createMockJob({
      to: 'buyer@test.com',
      subject: 'Inscrição Expirada',
      templateId: 'REGISTRATION_EXPIRED',
      tenantId: 'ten_1',
      variables: {
        userName: 'Astro Lazy',
        eventName: 'React Conf 2026',
      },
    });

    // Act
    await processEmail(job);

    // Assert
    const resendInstance = vi.mocked(ResendService).mock.results[0].value;
    expect(resendInstance.sendEmail).toHaveBeenCalledWith(
      'buyer@test.com',
      'Inscrição Expirada',
      expect.stringContaining('Inscrição Expirada')
    );
  });

  // deve enviar email com o template de reembolso de inscricao
  it('should process and send REGISTRATION_REFUNDED template email', async () => {
    // Arrange
    const job = createMockJob({
      to: 'buyer@test.com',
      subject: 'Inscrição Reembolsada',
      templateId: 'REGISTRATION_REFUNDED',
      tenantId: 'ten_1',
      variables: {
        userName: 'Astro Refunded',
        eventName: 'React Conf 2026',
      },
    });

    // Act
    await processEmail(job);

    // Assert
    const resendInstance = vi.mocked(ResendService).mock.results[0].value;
    expect(resendInstance.sendEmail).toHaveBeenCalledWith(
      'buyer@test.com',
      'Inscrição Reembolsada',
      expect.stringContaining('Inscrição Reembolsada')
    );
  });

  // deve testar fallbacks de variaveis vazias e templates desconhecidos
  it('should apply fallbacks when variables are missing or template is unknown', async () => {
    // Arrange
    const job = createMockJob({
      to: 'buyer@test.com',
      subject: 'Aviso Customizado',
      templateId: 'UNKNOWN_TEMPLATE',
      tenantId: 'ten_1',
      variables: {
        customField: 'Valor customizado',
      },
    });

    // Act
    await processEmail(job);

    // Assert
    const resendInstance = vi.mocked(ResendService).mock.results[0].value;
    expect(resendInstance.sendEmail).toHaveBeenCalledWith(
      'buyer@test.com',
      'Aviso Customizado',
      expect.stringContaining('Participante') // Fallback de userName
    );
    expect(resendInstance.sendEmail).toHaveBeenCalledWith(
      'buyer@test.com',
      'Aviso Customizado',
      expect.stringContaining('customField') // Renderizacao de chave desconhecida
    );
  });

  // deve propagar erro se o servico do Resend falhar
  it('should throw an error if the resend service fails', async () => {
    // Arrange
    const job = createMockJob({
      to: 'buyer@test.com',
      subject: 'Inscrição Confirmada!',
      templateId: 'REGISTRATION_CONFIRMED',
      tenantId: 'ten_1',
      variables: {
        userName: 'Astro Attendee',
        eventName: 'React Conf 2026',
      },
    });

    // Forçamos falha no resendService
    const mockSendEmail = vi.fn().mockRejectedValue(new Error('Resend API Error'));
    vi.mocked(ResendService).mockImplementationOnce(() => {
      return {
        sendEmail: mockSendEmail,
      };
    });

    // Act & Assert
    await expect(processEmail(job)).rejects.toThrow('Resend API Error');
  });

  // Testes diretos da geracao do HTML para garantir 100% de cobertura nos fallbacks internos dos templates conhecidos
  describe('buildHtmlTemplate fallbacks', () => {
    it('should test buildHtmlTemplate fallbacks for PAYMENT_PENDING_PIX', () => {
      const html = buildHtmlTemplate('PAYMENT_PENDING_PIX', 'Subject', {});
      expect(html).toContain('Participante'); // userName fallback
      expect(html).toContain('R$ 0.00'); // amount fallback
    });

    it('should test buildHtmlTemplate fallbacks for REGISTRATION_CONFIRMED', () => {
      const html = buildHtmlTemplate('REGISTRATION_CONFIRMED', 'Subject', {});
      expect(html).toContain('Participante');
      expect(html).toContain('Evento');
    });

    it('should test buildHtmlTemplate fallbacks for REGISTRATION_EXPIRED', () => {
      const html = buildHtmlTemplate('REGISTRATION_EXPIRED', 'Subject', {});
      expect(html).toContain('Participante');
      expect(html).toContain('Evento');
    });

    it('should test buildHtmlTemplate fallbacks for REGISTRATION_REFUNDED', () => {
      const html = buildHtmlTemplate('REGISTRATION_REFUNDED', 'Subject', {});
      expect(html).toContain('Participante');
      expect(html).toContain('Evento');
    });
  });
});
