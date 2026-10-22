import { INestApplication, ValidationPipe } from '@nestjs/common';
import { configureApp } from './app.config';

describe('App Configuration (configureApp)', () => {
  let mockApp: Partial<INestApplication>;

  beforeEach(() => {
    mockApp = {
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
    };
  });

  // deve configurar o prefixo global 'api' e o ValidationPipe com whitelist e transform
  it('should set global prefix to api and register global validation pipe', () => {
    // Arrange
    const app = mockApp as INestApplication;

    // Act
    configureApp(app);

    // Assert
    expect(mockApp.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(mockApp.useGlobalPipes).toHaveBeenCalledTimes(1);
    const pipeArg = (mockApp.useGlobalPipes as jest.Mock).mock.calls[0][0];
    expect(pipeArg).toBeInstanceOf(ValidationPipe);
  });
});
