import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.config';
import { getCorsOptions } from './cors.config';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  // Prefixo global, validação centralizada e filtro de exceções
  configureApp(app);

  // CORS robusto com suporte a produção, subdomínios e logging preventivo
  app.enableCors(getCorsOptions());

  // Configuração do Swagger
  const config = new DocumentBuilder()
    .setTitle('SyncFlow API')
    .setDescription(
      'API de alto desempenho para inscrições em eventos do SyncFlow',
    )
    .setVersion('1.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup('docs', app, document);

  const port = process.env.API_PORT ?? 3001;
  await app.listen(port);
  console.log(`🚀 API do SyncFlow rodando em: http://localhost:${port}/api`);
  console.log(
    `📖 Documentação Swagger disponível em: http://localhost:${port}/docs`,
  );
}
bootstrap();
