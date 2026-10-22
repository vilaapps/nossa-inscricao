import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createTestApp } from './helpers/create-test-app';

describe('AppController (e2e)', () => {
  let app: INestApplication;

  beforeEach(async () => {
    const testApp = await createTestApp();
    app = testApp.app;
  });

  // deve retornar Hello World no endpoint raiz com prefixo global /api
  it('/api (GET)', () => {
    return request(app.getHttpServer())
      .get('/api')
      .expect(200)
      .expect('Hello World!');
  });

  afterEach(async () => {
    await app.close();
  });
});
