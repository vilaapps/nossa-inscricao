import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefixo global de rotas
  app.setGlobalPrefix('api');

  // Validação global de DTOs
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      transform: true,
      forbidNonWhitelisted: true,
    }),
  );

  // CORS habilitado (suporta múltiplos domínios separados por vírgula)
  const allowedOrigins = process.env.WEB_URL
    ? process.env.WEB_URL.split(',').map((origin) => origin.trim())
    : ['http://localhost:4321'];

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
  });

  // Configuração do Swagger
  const config = new DocumentBuilder()
    .setTitle('SyncFlow API')
    .setDescription('API de alto desempenho para inscrições em eventos do SyncFlow')
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 API do SyncFlow rodando em: http://localhost:${port}/api`);
  console.log(`📖 Documentação Swagger disponível em: http://localhost:${port}/docs`);
}
bootstrap();
