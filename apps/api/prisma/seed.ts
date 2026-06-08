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
    },
  });
  console.log(`🏢 Tenant criado: ${tenant.name} (${tenant.id})`);

  // 3. Criar Usuário Administrador (Organizador) correspondente ao mock Clerk
  const adminUser = await prisma.user.create({
    data: {
      id: 'user_2m1nE9nC3K0t5p1Q2vR3W4xY5zZ', // ID mockado do Clerk para o Admin
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

  // Evento 1: Meia Maratona do Rio
  const event1 = await prisma.event.create({
    data: {
      id: 'evt_meia_rio',
      tenantId: tenant.id,
      title: 'MEIA MARATONA DE COPACABANA 2026',
      description: 'A corrida mais charmosa do Rio de Janeiro. Percorra a orla de Copacabana e Ipanema sob o sol matutino com suporte de hidratação premium de 2 em 2 quilômetros, medalha de finisher em metal pesado e kit com camiseta tecnológica de alta absorção.',
      slug: 'meia-maratona-copacabana-2026',
      date: new Date('2026-10-18T07:00:00Z'),
      status: 'PUBLISHED',
      availableSlots: 1500,
    },
  });

  // Categorias do Evento 1
  const cat1_5k = await prisma.category.create({
    data: {
      eventId: event1.id,
      tenantId: tenant.id,
      name: 'Corrida 5K - Geral',
      gender: 'MISTO',
      price: 0,
      availableSlots: 400,
    },
  });

  const cat1_10k = await prisma.category.create({
    data: {
      eventId: event1.id,
      tenantId: tenant.id,
      name: 'Corrida 10K - Geral',
      gender: 'MISTO',
      price: 0,
      availableSlots: 500,
    },
  });

  const cat1_21k = await prisma.category.create({
    data: {
      eventId: event1.id,
      tenantId: tenant.id,
      name: 'Meia Maratona 21K - Elite/Geral',
      gender: 'MISTO',
      price: 0,
      availableSlots: 600,
    },
  });

  // Lotes do Evento 1
  await prisma.batch.create({
    data: {
      eventId: event1.id,
      tenantId: tenant.id,
      name: 'Lote Promocional (Esgotado)',
      price: 69.90,
      maxQuantity: 150,
      soldQuantity: 150,
      active: false,
    },
  });

  const batch1_active = await prisma.batch.create({
    data: {
      id: 'batch_rio_1',
      eventId: event1.id,
      tenantId: tenant.id,
      name: '1º Lote Oficial',
      price: 99.90,
      maxQuantity: 800,
      soldQuantity: 124,
      active: true,
      startDate: new Date('2026-01-01T00:00:00Z'),
      endDate: new Date('2026-08-31T23:59:59Z'),
    },
  });

  await prisma.batch.create({
    data: {
      eventId: event1.id,
      tenantId: tenant.id,
      name: '2º Lote Oficial',
      price: 139.90,
      maxQuantity: 550,
      soldQuantity: 0,
      active: false,
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

  console.log(`🏃 Evento 1 criado: ${event1.title} com 3 categorias e 3 lotes.`);

  // Evento 2: GP Ultra Trail
  const event2 = await prisma.event.create({
    data: {
      id: 'evt_trail_serra',
      tenantId: tenant.id,
      title: 'GP ULTRA TRAIL SERRA DA MANTIQUEIRA 2026',
      description: 'Desafie seus limites nas montanhas mais íngremes da Serra da Mantiqueira. Uma corrida de trilha pura, com altimetria acumulada desafiadora de mais de 2500m nas distâncias principais, travessia de riachos e paisagens deslumbrantes.',
      slug: 'gp-ultra-trail-mantiqueira-2026',
      date: new Date('2026-08-15T06:00:00Z'),
      status: 'PUBLISHED',
      availableSlots: 600,
    },
  });

  // Categorias do Evento 2
  await prisma.category.create({
    data: {
      eventId: event2.id,
      tenantId: tenant.id,
      name: 'Short Trail 12K - Misto',
      gender: 'MISTO',
      price: 0,
      availableSlots: 200,
    },
  });

  await prisma.category.create({
    data: {
      eventId: event2.id,
      tenantId: tenant.id,
      name: 'Medium Trail 25K - Geral',
      gender: 'MISTO',
      price: 0,
      availableSlots: 200,
    },
  });

  await prisma.category.create({
    data: {
      eventId: event2.id,
      tenantId: tenant.id,
      name: 'Ultra Trail 50K - Elite/Geral',
      gender: 'MISTO',
      price: 0,
      availableSlots: 200,
    },
  });

  // Lotes do Evento 2
  const batch2_active = await prisma.batch.create({
    data: {
      id: 'batch_trail_1',
      eventId: event2.id,
      tenantId: tenant.id,
      name: 'Lote Único Geral',
      price: 159.00,
      maxQuantity: 600,
      soldQuantity: 412,
      active: true,
    },
  });

  // Cupom do Evento 2
  await prisma.coupon.create({
    data: {
      eventId: event2.id,
      tenantId: tenant.id,
      code: 'TRAIL20',
      discountType: 'PERCENTAGE',
      discountValue: 20.00,
      maxUses: 100,
      usedCount: 45,
      active: true,
    },
  });

  console.log(`⛰️ Evento 2 criado: ${event2.title} com 3 categorias e 1 lote.`);

  // Evento 3: Desafio Ciclismo
  const event3 = await prisma.event.create({
    data: {
      id: 'evt_ciclismo_anjos',
      tenantId: tenant.id,
      title: 'DESAFIO DOS ANJOS DE CICLISMO DE ESTRADA',
      description: 'Uma prova clássica para ciclistas de estrada. Um circuito de 80km de pura adrenalina com asfalto perfeito, pelotões organizados e cronometragem eletrônica ativa por transponder. Subidas desafiadoras que testarão seu sprint final.',
      slug: 'desafio-anjos-ciclismo-2026',
      date: new Date('2026-11-22T08:00:00Z'),
      status: 'PUBLISHED',
      availableSlots: 400,
    },
  });

  // Categorias do Evento 3
  await prisma.category.create({
    data: {
      eventId: event3.id,
      tenantId: tenant.id,
      name: 'Ciclismo Speed - Masculino Pro',
      gender: 'MASCULINO',
      price: 0,
      availableSlots: 100,
    },
  });

  await prisma.category.create({
    data: {
      eventId: event3.id,
      tenantId: tenant.id,
      name: 'Ciclismo Speed - Feminino Pro',
      gender: 'FEMININO',
      price: 0,
      availableSlots: 100,
    },
  });

  await prisma.category.create({
    data: {
      eventId: event3.id,
      tenantId: tenant.id,
      name: 'Ciclismo Speed - Geral Amador',
      gender: 'MISTO',
      price: 0,
      availableSlots: 200,
    },
  });

  // Lotes do Evento 3
  const batch3_active = await prisma.batch.create({
    data: {
      id: 'batch_ciclismo_1',
      eventId: event3.id,
      tenantId: tenant.id,
      name: 'Lote Promocional Ciclismo',
      price: 180.00,
      maxQuantity: 200,
      soldQuantity: 198, // Quase esgotado!
      active: true,
    },
  });

  await prisma.batch.create({
    data: {
      eventId: event3.id,
      tenantId: tenant.id,
      name: 'Lote Regular Ciclismo',
      price: 240.00,
      maxQuantity: 200,
      soldQuantity: 0,
      active: false,
    },
  });

  console.log(`🚴 Evento 3 criado: ${event3.title} com 3 categorias e 2 lotes.`);

  // 5. Adicionar algumas inscricoes ficticias do participante usr_test_123 para popular o painel dele
  
  // Inscrição 1: Copacabana 2026 (Confirmada e paga)
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
      amountPaid: 99.90,
      metadata: { size: 'G', healthAgreement: true } as any,
    },
  });

  await prisma.payment.create({
    data: {
      registrationId: reg1.id,
      tenantId: tenant.id,
      amount: 99.90,
      status: 'PAID',
      method: 'PIX',
      pixQrCode: '00020101021226830014br.gov.bcb.pix2561api.asaas.com/v2/pix/qr/pay/mock_pay_1',
      gatewayPaymentId: 'pay_mock_asaas_123',
    },
  });

  // Inscrição 2: GP Trail (Pendente de pagamento)
  const reg2 = await prisma.registration.create({
    data: {
      id: 'reg_ficticia_2',
      tenantId: tenant.id,
      eventId: event2.id,
      categoryId: (await prisma.category.findFirst({ where: { eventId: event2.id } }))!.id,
      batchId: batch2_active.id,
      userId: participantUser.id,
      status: 'PENDING',
      paymentStatus: 'PENDING',
      amountPaid: 159.00,
      metadata: { size: 'M', healthAgreement: true } as any,
    },
  });

  await prisma.payment.create({
    data: {
      registrationId: reg2.id,
      tenantId: tenant.id,
      amount: 159.00,
      status: 'PENDING',
      method: 'PIX',
      pixQrCode: '00020101021226830014br.gov.bcb.pix2561api.asaas.com/v2/pix/qr/pay/mock_pay_trail_2',
      gatewayPaymentId: 'pay_mock_asaas_456',
      pixExpiration: new Date(Date.now() + 24 * 60 * 60 * 1000), // expira em 24h
    },
  });

  console.log('📝 Inscrições e pagamentos fictícios criados para o participante de testes.');
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
