import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {
  ReceiptData,
  maskCpf,
  formatReceiptPrice,
  formatReceiptBirthDate,
} from './receipt-model';

import { DEFAULT_APP_LOGO_BASE64 } from './receipt-logo';

export { DEFAULT_APP_LOGO_BASE64 };

function getDefaultAppLogoBuffer(): Buffer {
  return Buffer.from(DEFAULT_APP_LOGO_BASE64, 'base64');
}


/**
 * Renderiza um comprovante de inscrição oficial em formato PDF.
 * Inclui dados do evento, do atleta (com CPF mascarado), da categoria/lote,
 * camiseta (se houver), valor pago (ou GRATUITO) e QR Code com código de verificação.
 */
export async function renderReceiptPdf(data: ReceiptData): Promise<Buffer> {
  // Gera imagem do QR Code em buffer PNG
  const qrBuffer = await QRCode.toBuffer(data.verificationUrl, {
    width: 100,
    margin: 1,
    color: {
      dark: '#111827',
      light: '#ffffff',
    },
  });

  return new Promise<Buffer>((resolve, reject) => {
    const doc = new PDFDocument({
      size: 'A4',
      margin: 40,
      info: {
        Title: `Comprovante - ${data.receiptCode}`,
        Author: 'NossaInscricao',
        Subject: `Comprovante de Inscrição - ${data.eventName}`,
      },
    });

    const chunks: Buffer[] = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', (err) => reject(err));

    // Paleta de Cores (Neutros e Esmeralda, sem violeta/roxo)
    const primaryColor = '#059669'; // Emerald-600
    const darkColor = '#111827'; // Ink
    const grayColor = '#4B5563'; // Ink-muted
    const lightBg = '#F3F4F6';

    // 1. Cabeçalho / HUD com Ícone Oficial da Aplicação
    const logoToRender =
      data.logoBuffer !== undefined ? data.logoBuffer : getDefaultAppLogoBuffer();

    if (logoToRender) {
      try {
        doc.image(logoToRender, 40, 38, { width: 36, height: 36 });
      } catch {
        // Fallback silencioso e gracioso caso o buffer customizado seja inválido
      }
    }

    const titleX = logoToRender ? 86 : 40;

    doc
      .fillColor(primaryColor)
      .fontSize(9.5)
      .font('Helvetica-Bold')
      .text('NOSSA INSCRIÇÃO • SISTEMA DE GESTÃO ESPORTIVA', titleX, 40, { characterSpacing: 0.5 });

    doc
      .fillColor(darkColor)
      .fontSize(15)
      .font('Helvetica-Bold')
      .text('COMPROVANTE OFICIAL DE INSCRIÇÃO', titleX, 55);

    // Box de Código de Verificação
    doc
      .rect(415, 38, 140, 36)
      .fillAndStroke(lightBg, '#E5E7EB');

    doc
      .fillColor(grayColor)
      .fontSize(8)
      .font('Helvetica')
      .text('CÓDIGO DE AUTENTICIDADE', 425, 44);

    doc
      .fillColor(primaryColor)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(data.receiptCode, 425, 56);

    doc
      .moveTo(40, 88)
      .lineTo(555, 88)
      .strokeColor('#E5E7EB')
      .lineWidth(1)
      .stroke();

    // 2. Seção: Informações do Evento
    let currentY = 105;
    doc
      .fillColor(primaryColor)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('DADOS DA COMPETIÇÃO', 40, currentY);

    currentY += 16;
    doc
      .fillColor(darkColor)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(data.eventName, 40, currentY, { width: 515 });

    currentY = doc.y + 6;

    const eventDateFormatted = new Date(data.eventDate).toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    doc
      .fillColor(grayColor)
      .fontSize(9)
      .font('Helvetica')
      .text(`Data da Prova: ${eventDateFormatted}    •    Local: ${data.eventLocation || 'A definir pela organização'}`, 40, currentY);

    currentY += 24;

    // 3. Seção: Informações do Atleta
    doc
      .rect(40, currentY, 515, 85)
      .fillAndStroke('#FAFAFA', '#E5E7EB');

    doc
      .fillColor(primaryColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('DADOS DO PARTICIPANTE', 55, currentY + 12);

    doc
      .fillColor(darkColor)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text(data.athleteName, 55, currentY + 28);

    doc
      .fillColor(grayColor)
      .fontSize(9)
      .font('Helvetica')
      .text(`CPF: ${maskCpf(data.athleteCpf)}`, 55, currentY + 46);

    const birthFormatted = formatReceiptBirthDate(data.athleteBirthDate);
    const athleteDetailsParts: string[] = [];
    if (birthFormatted) athleteDetailsParts.push(`Nascimento: ${birthFormatted}`);
    if (data.athleteGender) athleteDetailsParts.push(`Gênero: ${data.athleteGender}`);

    if (athleteDetailsParts.length > 0) {
      doc
        .fillColor(grayColor)
        .fontSize(9)
        .font('Helvetica')
        .text(athleteDetailsParts.join('    •    '), 55, currentY + 62);
    }

    currentY += 105;

    // 4. Seção: Dados da Inscrição e Categoria
    doc
      .fillColor(primaryColor)
      .fontSize(11)
      .font('Helvetica-Bold')
      .text('DETALHES DA INSCRIÇÃO', 40, currentY);

    currentY += 18;

    doc
      .rect(40, currentY, 515, 65)
      .fillAndStroke('#FAFAFA', '#E5E7EB');

    doc
      .fillColor(grayColor)
      .fontSize(8)
      .font('Helvetica')
      .text('CATEGORIA', 55, currentY + 12)
      .text('LOTE DE INSCRIÇÃO', 230, currentY + 12);

    if (data.shirtSize) {
      doc.text('KIT / CAMISETA', 410, currentY + 12);
    }

    doc
      .fillColor(darkColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text(data.categoryName, 55, currentY + 26, { width: 165 })
      .text(data.batchName, 230, currentY + 26, { width: 165 });

    if (data.shirtSize) {
      doc.text(`Tamanho ${data.shirtSize}`, 410, currentY + 26);
    }

    currentY += 85;

    // 5. Seção Financeira
    doc
      .rect(40, currentY, 515, 48)
      .fillAndStroke('#ECFDF5', '#A7F3D0'); // Emerald soft bg

    doc
      .fillColor(primaryColor)
      .fontSize(9)
      .font('Helvetica-Bold')
      .text('TOTAL PAGO', 55, currentY + 12);

    doc
      .fillColor(darkColor)
      .fontSize(14)
      .font('Helvetica-Bold')
      .text(formatReceiptPrice(data.amountPaid), 55, currentY + 24);

    currentY += 75;

    // 6. Bloco de Autenticação com QR Code
    doc
      .rect(40, currentY, 515, 115)
      .fillAndStroke('#FFFFFF', '#E5E7EB');

    // Insere imagem do QR Code
    doc.image(qrBuffer, 55, currentY + 10, { width: 95, height: 95 });

    doc
      .fillColor(darkColor)
      .fontSize(10)
      .font('Helvetica-Bold')
      .text('VERIFICAÇÃO DE AUTENTICIDADE', 165, currentY + 16);

    doc
      .fillColor(grayColor)
      .fontSize(8.5)
      .font('Helvetica')
      .text(
        'Este comprovante é nominal e intransferível. Aponte a câmera do seu celular para o QR Code ao lado ou acesse o link de validação para conferir o status oficial desta inscrição em nosso sistema em tempo real.',
        165,
        currentY + 32,
        { width: 370, lineGap: 3 },
      );

    doc
      .fillColor(primaryColor)
      .fontSize(8.5)
      .font('Helvetica-Bold')
      .text(data.verificationUrl, 165, currentY + 80, { width: 370 });

    // 7. Rodapé
    const issuedDate = data.issuedAt ? new Date(data.issuedAt) : new Date();
    const issuedFormatted = issuedDate.toLocaleDateString('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });

    doc
      .fillColor(grayColor)
      .fontSize(7.5)
      .font('Helvetica')
      .text(`Emitido em ${issuedFormatted} • Documento gerado automaticamente por SyncFlow`, 40, 780, {
        align: 'center',
        width: 515,
      });

    doc.end();
  });
}
