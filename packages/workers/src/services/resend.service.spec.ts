import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ResendService } from './resend.service';
import { Resend } from 'resend';

// Mocks do SDK do Resend
vi.mock('resend', () => {
  const mockSend = vi.fn();
  return {
    Resend: vi.fn().mockImplementation(() => {
      return {
        emails: {
          send: mockSend,
        },
      };
    }),
  };
});

describe('ResendService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('RESEND_API_KEY', 'global-resend-key');
    vi.stubEnv('RESEND_FROM_EMAIL', 'global@sender.com');
  });

  // deve instanciar com chaves passadas por parametro no construtor
  it('should instantiate using constructor parameters', () => {
    // Arrange & Act
    const service = new ResendService('custom-param-key', 'param@sender.com');
    const mockResendInstance = vi.mocked(Resend);

    // Assert
    expect(mockResendInstance).toHaveBeenCalledWith('custom-param-key');
    expect((service as any).defaultFrom).toBe('param@sender.com');
  });

  // deve instanciar com fallbacks caso nao exista env nem param
  it('should fallback to defaults if constructor arguments and env vars are absent', () => {
    // Arrange
    vi.stubEnv('RESEND_API_KEY', undefined as any);
    vi.stubEnv('RESEND_FROM_EMAIL', undefined as any);

    // Act
    const service = new ResendService(undefined, undefined);
    const mockResendInstance = vi.mocked(Resend);

    // Assert
    expect(mockResendInstance).toHaveBeenCalledWith('mock-key');
    expect((service as any).defaultFrom).toBe('onboarding@resend.dev');
  });

  // deve instanciar e enviar email usando configuracoes globais
  it('should send email successfully using global configurations', async () => {
    // Arrange
    const service = new ResendService();
    const mockResendInstance = vi.mocked(Resend);
    const mockSend = mockResendInstance.mock.results[0].value.emails.send;
    
    mockSend.mockResolvedValue({
      data: { id: 'email-sent-id-123' },
      error: null,
    });

    const to = 'participant@example.com';
    const subject = 'Inscrição Confirmada';
    const html = '<p>Sua vaga está garantida!</p>';

    // Act
    const result = await service.sendEmail(to, subject, html);

    // Assert
    expect(result.id).toBe('email-sent-id-123');
    expect(mockSend).toHaveBeenCalledWith({
      from: 'global@sender.com',
      to,
      subject,
      html,
    });
  });

  // deve retornar id vazio se o response.data nao contiver o ID
  it('should return empty string as ID if response.data is null or does not have ID', async () => {
    // Arrange
    const service = new ResendService();
    const mockResendInstance = vi.mocked(Resend);
    const mockSend = mockResendInstance.mock.results[0].value.emails.send;
    
    mockSend.mockResolvedValue({
      data: null,
      error: null,
    });

    // Act
    const result = await service.sendEmail('test@test.com', 'Subject', 'HTML');

    // Assert
    expect(result.id).toBe('');
  });

  // deve usar a chave customizada/tenant se for fornecida no envio
  it('should instantiate a new Resend client with custom tenant key when provided', async () => {
    // Arrange
    const service = new ResendService();
    const mockResendInstance = vi.mocked(Resend);
    const mockSend = mockResendInstance.mock.results[0].value.emails.send;

    mockSend.mockResolvedValue({
      data: { id: 'email-custom-sent-id' },
      error: null,
    });

    const customKey = 'tenant-custom-resend-key';
    const customFrom = 'contato@organizador.com';

    // Act
    await service.sendEmail(
      'participant@example.com',
      'Assunto',
      'HTML',
      customKey,
      customFrom
    );

    // Assert
    // Deve instanciar o Resend duas vezes (uma no constructor global e outra na chamada com chave customizada)
    expect(mockResendInstance).toHaveBeenCalledTimes(2);
    expect(mockResendInstance).toHaveBeenLastCalledWith(customKey);
  });

  // deve lancar erro caso o envio de email falhe no SDK do Resend
  it('should throw an error if the Resend SDK returns an error message', async () => {
    // Arrange
    const service = new ResendService();
    const mockResendInstance = vi.mocked(Resend);
    const mockSend = mockResendInstance.mock.results[0].value.emails.send;

    mockSend.mockResolvedValue({
      data: null,
      error: { message: 'Invalid API key', name: 'validation_error' },
    });

    // Act & Assert
    await expect(
      service.sendEmail('participant@example.com', 'Assunto', 'HTML')
    ).rejects.toThrow('Failed to send email: Invalid API key');
  });
});
