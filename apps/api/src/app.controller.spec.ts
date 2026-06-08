import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';

describe('AppController', () => {
  let appController: AppController;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();

    appController = app.get<AppController>(AppController);
  });

  describe('root', () => {
    // deve retornar a mensagem de boas-vindas "Hello World!"
    it('should return "Hello World!"', () => {
      // Arrange
      // (Nenhum setup adicional necessário neste teste simples)

      // Act
      const result = appController.getHello();

      // Assert
      expect(result).toBe('Hello World!');
    });
  });
});
