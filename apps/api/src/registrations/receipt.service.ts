import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  ConflictException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../infrastructure/prisma/prisma.service';
import {
  generateReceiptCode,
  maskName,
  renderReceiptPdf,
  ReceiptData,
} from '@syncflow/shared';

export interface PublicReceiptVerification {
  valid: boolean;
  receiptCode: string;
  status: string;
  athleteName: string;
  eventName: string;
  eventDate: Date;
  categoryName: string;
}

@Injectable()
export class ReceiptService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
  ) {}

  async generateReceipt(
    registrationId: string,
    user: { id: string },
  ): Promise<{ buffer: Buffer; filename: string }> {
    const registration = await this.prisma.registration.findUnique({
      where: { id: registrationId },
      include: {
        event: true,
        category: true,
        batch: true,
        user: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Inscrição não encontrada.');
    }

    // Valida papel do usuário no banco
    const dbUser = await this.prisma.user.findUnique({
      where: { id: user.id },
    });

    const isOwner = registration.userId === user.id;
    const isAdmin = dbUser?.role === 'ADMIN';

    if (!isOwner && !isAdmin) {
      throw new ForbiddenException(
        'Você não tem permissão para acessar o comprovante desta inscrição.',
      );
    }

    if (registration.status !== 'CONFIRMED') {
      throw new ConflictException(
        'O comprovante só está disponível para inscrições confirmadas.',
      );
    }

    let receiptCode = registration.receiptCode;
    if (!receiptCode) {
      receiptCode = generateReceiptCode();
      await this.prisma.registration.update({
        where: { id: registration.id },
        data: { receiptCode },
      });
    }

    const metadata = (registration.metadata as any) || {};
    const rawShirtSize =
      metadata.shirtSize || metadata.complementaryData?.shirtSize || null;
    const shirtSize = registration.event.hasKit ? rawShirtSize : null;

    const athleteCpf =
      (registration.user as any)?.cpf ||
      metadata.cpf ||
      metadata.complementaryData?.cpf ||
      '';

    const webBaseUrl =
      this.configService.get<string>('WEB_APP_URL') || 'https://syncflow.com';
    const verificationUrl = `${webBaseUrl}/verificar/${receiptCode}`;

    const receiptData: ReceiptData = {
      receiptCode,
      eventName: registration.event.title,
      eventDate: registration.event.date,
      eventLocation: registration.event.location,
      athleteName: registration.user?.name || 'Participante',
      athleteCpf,
      athleteBirthDate: registration.athleteBirthDate,
      athleteGender: registration.athleteGender,
      categoryName: registration.category.name,
      batchName: registration.batch.name,
      shirtSize,
      amountPaid: Number(registration.amountPaid || 0),
      verificationUrl,
      issuedAt: registration.updatedAt,
    };

    const buffer = await renderReceiptPdf(receiptData);

    return {
      buffer,
      filename: `comprovante-${receiptCode}.pdf`,
    };
  }

  async verifyReceipt(code: string): Promise<PublicReceiptVerification> {
    const normalizedCode = (code || '').trim().toUpperCase();

    const registration = await this.prisma.registration.findUnique({
      where: { receiptCode: normalizedCode },
      include: {
        event: true,
        category: true,
        user: true,
      },
    });

    if (!registration) {
      throw new NotFoundException('Comprovante não encontrado.');
    }

    return {
      valid: registration.status === 'CONFIRMED',
      receiptCode: registration.receiptCode!,
      status: registration.status,
      athleteName: maskName(registration.user?.name || ''),
      eventName: registration.event.title,
      eventDate: registration.event.date,
      categoryName: registration.category.name,
    };
  }
}
