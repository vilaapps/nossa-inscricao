import PDFDocument from 'pdfkit';
import QRCode from 'qrcode';
import {
  ReceiptData,
  maskCpf,
  formatReceiptPrice,
  formatReceiptBirthDate,
} from './receipt-model';

export const DEFAULT_APP_LOGO_BASE64 =
  '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';

const DEFAULT_APP_LOGO_BUFFER = Buffer.from(DEFAULT_APP_LOGO_BASE64, 'base64');

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
      data.logoBuffer !== undefined ? data.logoBuffer : DEFAULT_APP_LOGO_BUFFER;

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
