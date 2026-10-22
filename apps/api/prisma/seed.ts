import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...');

  // 1. Limpeza de dados antigos para evitar duplicidades no dev local
  await prisma.payment.deleteMany({});
  await prisma.registration.deleteMany({});
  await prisma.coupon.deleteMany({});
  await prisma.batch.deleteMany({});
  await prisma.category.deleteMany({});
  await prisma.event.deleteMany({});
  await prisma.user.deleteMany({});
  await prisma.tenant.deleteMany({});

  console.log('🧹 Limpeza concluída.');

  // 2. Criar Tenant
  const tenant = await prisma.tenant.create({
    data: {
      id: 'tenant-1',
      name: 'Corrida Brasil Organizações',
      commissionRate: 10.00,
    },
  });
  console.log(`🏢 Tenant criado: ${tenant.name} (${tenant.id})`);

  // 3. Criar Usuário Administrador (Organizador) correspondente ao mock Clerk
  const adminUser = await prisma.user.create({
    data: {
      id: 'user_2m1nE9nC3K0t5p1Q2vR3W4xY5zZ',
      email: 'organizador@corrida.com.br',
      name: 'Carlos Organizador',
      role: 'ORGANIZER',
      tenantId: tenant.id,
    },
  });
  console.log(`👤 Usuário Admin criado: ${adminUser.name}`);

  // Criar Usuário Participante de Teste
  const participantUser = await prisma.user.create({
    data: {
      id: 'usr_test_123',
      email: 'atleta.teste@gmail.com',
      name: 'Roberto Corredor',
      role: 'PARTICIPANT',
    },
  });
  console.log(`👤 Usuário Participante de Teste criado: ${participantUser.name}`);

  // 4. Criar Eventos

  // Evento 1: Meia Maratona do Rio (Com Kit Oficial, Taxa padrão do Tenant 10%, lotes por categoria)
  const event1 = await prisma.event.create({
    data: {
      id: 'evt_meia_rio',
      tenantId: tenant.id,
      title: 'MEIA MARATONA DE COPACABANA 2026',
      description: 'A corrida mais charmosa do Rio de Janeiro. Percorra a orla de Copacabana e Ipanema sob o sol matutino com suporte de hidratação premium de 2 em 2 quilômetros, medalha de finisher em metal pesado e kit com camiseta tecnológica de alta absorção.',
      slug: 'meia-maratona-copacabana-2026',
      date: new Date('2026-10-18T07:00:00Z'),
      registrationOpensAt: new Date('2026-01-01T00:00:00Z'),
      hasKit: true,
      kitSizes: ['P', 'M', 'G', 'GG'],
      adminFeeRate: null, // Usa o padrão do tenant (10%)
      status: 'PUBLISHED',
      availableSlots: 1500,
    },
  });

  // Categorias do Evento 1
  const cat1_5k = await prisma.category.create({
    data: {
      id: 'cat_meia_rio_5k',
      eventId: event1.id,
      tenantId: tenant.id,
      name: 'Corrida 5K - Geral',
      gender: 'MISTO',
      minAge: 16,
      maxAge: 99,
      price: 99.90,
      totalSlots: 400,
      availableSlots: 400,
    },
  });

  const cat1_10k = await prisma.category.create({
    data: {
      id: 'cat_meia_rio_10k',
      eventId: event1.id,
      tenantId: tenant.id,
      name: 'Corrida 10K - Geral',
      gender: 'MISTO',
      minAge: 18,
      maxAge: 99,
      price: 119.90,
      totalSlots: 500,
      availableSlots: 500,
    },
  });

  const cat1_21k = await prisma.category.create({
    data: {
      id: 'cat_meia_rio_21k',
      eventId: event1.id,
      tenantId: tenant.id,
      name: 'Meia Maratona 21K - Elite/Geral',
      gender: 'MISTO',
      minAge: 18,
      maxAge: 99,
      price: 149.90,
      totalSlots: 600,
      availableSlots: 600,
    },
  });

  // Lotes vinculados diretamente à Categoria 10K (Exemplo de 3 lotes mistos: DATE -> QUANTITY -> DATE)
  await prisma.batch.create({
    data: {
      id: 'batch_rio_10k_l1',
      eventId: event1.id,
      categoryId: cat1_10k.id,
      tenantId: tenant.id,
      name: '1º Lote (Abertura por Data)',
      price: 99.90,
      type: 'DATE',
      position: 1,
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-06-30T23:59:59Z'),
      maxQuantity: 200,
      soldQuantity: 200, // Fechado/esgotado
      active: true,
    },
  });

  const batch1_active = await prisma.batch.create({
    data: {
      id: 'batch_rio_10k_l2',
      eventId: event1.id,
      categoryId: cat1_10k.id,
      tenantId: tenant.id,
      name: '2º Lote (Por Quantidade - Ativo)',
      price: 119.90,
      type: 'QUANTITY',
      position: 2,
      maxQuantity: 150,
      soldQuantity: 42,
      active: true,
    },
  });

  await prisma.batch.create({
    data: {
      id: 'batch_rio_10k_l3',
      eventId: event1.id,
      categoryId: cat1_10k.id,
      tenantId: tenant.id,
      name: '3º Lote Final (Por Data)',
      price: 139.90,
      type: 'DATE',
      position: 3,
      startDate: new Date('2026-07-01T00:00:00Z'),
      endDate: new Date('2026-10-10T23:59:59Z'),
      maxQuantity: 150,
      soldQuantity: 0,
      active: true,
    },
  });

  // Lotes para Categoria 5K
  await prisma.batch.create({
    data: {
      id: 'batch_rio_5k_l1',
      eventId: event1.id,
      categoryId: cat1_5k.id,
      tenantId: tenant.id,
      name: 'Lote Único 5K',
      price: 89.90,
      type: 'QUANTITY',
      position: 1,
      maxQuantity: 400,
      soldQuantity: 80,
      active: true,
    },
  });

  // Cupom do Evento 1
  await prisma.coupon.create({
    data: {
      eventId: event1.id,
      tenantId: tenant.id,
      code: 'RIO10',
      discountType: 'PERCENTAGE',
      discountValue: 10.00,
      maxUses: 200,
      usedCount: 12,
      active: true,
    },
  });

  // Cupom 100% OFF (Gratuidade)
  await prisma.coupon.create({
    data: {
      eventId: event1.id,
      tenantId: tenant.id,
      code: 'GRATIS100',
      discountType: 'PERCENTAGE',
      discountValue: 100.00,
      maxUses: 50,
      usedCount: 1,
      active: true,
    },
  });

  console.log(`🏃 Evento 1 criado: ${event1.title} com kit e lotes por categoria.`);

  // Evento 2: Treinão Social Gratuito (Sem Kit, Gratuito, Taxa 0%)
  const event2 = await prisma.event.create({
    data: {
      id: 'evt_treinao_social',
      tenantId: tenant.id,
      title: 'TREINÃO SOCIAL DA COMUNIDADE 2026',
      description: 'Evento 100% gratuito e comunitário aberto para todos os atletas e entusiastas da corrida.',
      slug: 'treinao-social-comunidade-2026',
      date: new Date('2026-09-20T08:00:00Z'),
      registrationOpensAt: new Date('2026-02-01T00:00:00Z'),
      hasKit: false,
      kitSizes: [],
      adminFeeRate: 0, // Isenção de taxa
      status: 'PUBLISHED',
      availableSlots: 300,
    },
  });

  const cat2_geral = await prisma.category.create({
    data: {
      id: 'cat_treinao_geral',
      eventId: event2.id,
      tenantId: tenant.id,
      name: 'Caminhada & Corrida 3K - Livre',
      gender: 'MISTO',
      price: 0,
      totalSlots: 300,
      availableSlots: 280,
    },
  });

  await prisma.batch.create({
    data: {
      id: 'batch_treinao_free',
      eventId: event2.id,
      categoryId: cat2_geral.id,
      tenantId: tenant.id,
      name: 'Inscrição Gratuita',
      price: 0,
      type: 'QUANTITY',
      position: 1,
      maxQuantity: 300,
      soldQuantity: 20,
      active: true,
    },
  });

  console.log(`🎉 Evento 2 criado: ${event2.title} (Gratuito, sem kit, taxa 0%).`);

  // Evento 3: Desafio Ciclismo com Taxa Personalizada (0% de taxa por evento promocional)
  const event3 = await prisma.event.create({
    data: {
      id: 'evt_ciclismo_zero_taxa',
      tenantId: tenant.id,
      title: 'DESAFIO DE CICLISMO SEM TAXA 2026',
      description: 'Prova com taxa administrativa subsidiada pelo organizador (0% de taxa).',
      slug: 'desafio-ciclismo-zero-taxa-2026',
      date: new Date('2026-11-22T08:00:00Z'),
      registrationOpensAt: new Date('2026-03-01T00:00:00Z'),
      hasKit: true,
      kitSizes: ['P', 'M', 'G'],
      adminFeeRate: 0, // Override de 0%
      status: 'PUBLISHED',
      availableSlots: 200,
    },
  });

  const cat3_speed = await prisma.category.create({
    data: {
      id: 'cat_ciclismo_speed',
      eventId: event3.id,
      tenantId: tenant.id,
      name: 'Speed Pro 60K',
      gender: 'MISTO',
      minAge: 18,
      price: 150.00,
      totalSlots: 200,
      availableSlots: 195,
    },
  });

  await prisma.batch.create({
    data: {
      id: 'batch_ciclismo_lote1',
      eventId: event3.id,
      categoryId: cat3_speed.id,
      tenantId: tenant.id,
      name: 'Lote Promocional',
      price: 150.00,
      type: 'QUANTITY',
      position: 1,
      maxQuantity: 200,
      soldQuantity: 5,
      active: true,
    },
  });

  console.log(`🚴 Evento 3 criado: ${event3.title} com taxa 0%.`);

  // 5. Inscrições fictícias para testes com comprovante
  const reg1 = await prisma.registration.create({
    data: {
      id: 'reg_ficticia_1',
      tenantId: tenant.id,
      eventId: event1.id,
      categoryId: cat1_10k.id,
      batchId: batch1_active.id,
      userId: participantUser.id,
      status: 'CONFIRMED',
      paymentStatus: 'PAID',
      amountPaid: 131.89, // 119.90 + 10%
      athleteBirthDate: new Date('1990-05-15'),
      athleteGender: 'MASCULINO',
      receiptCode: 'SF-RIO-908123',
      metadata: { shirtSize: 'G', healthAgreement: true } as any,
    },
  });

  await prisma.payment.create({
    data: {
      registrationId: reg1.id,
      tenantId: tenant.id,
      amount: 131.89,
      status: 'PAID',
      method: 'PIX',
      pixQrCode: '00020101021226830014br.gov.bcb.pix2561api.asaas.com/v2/pix/qr/pay/mock_pay_1',
      gatewayPaymentId: 'pay_mock_asaas_123',
    },
  });

  console.log('📝 Inscrição de teste com receiptCode criada.');
  console.log('🏁 Seed concluído com 100% de sucesso!');
}

main()
  .catch((e) => {
    console.error('❌ Erro durante o seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
