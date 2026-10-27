import { INestApplication, ValidationPipe } from '@nestjs/common';
import { HttpExceptionFilter } from './infrastructure/filters/http-exception.filter';

export function configureApp(app: INestApplication): void {
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

  // Filtro global de exceções com logging detalhado
  app.useGlobalFilters(new HttpExceptionFilter());
}

