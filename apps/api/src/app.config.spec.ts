import { INestApplication, ValidationPipe } from '@nestjs/common';
import { configureApp } from './app.config';
import { HttpExceptionFilter } from './infrastructure/filters/http-exception.filter';

describe('App Configuration (configureApp)', () => {
  let mockApp: Partial<INestApplication>;

  beforeEach(() => {
    mockApp = {
      setGlobalPrefix: jest.fn(),
      useGlobalPipes: jest.fn(),
      useGlobalFilters: jest.fn(),
    };
  });

  // deve configurar o prefixo global 'api', ValidationPipe e HttpExceptionFilter
  it('should set global prefix to api, register global validation pipe and exception filter', () => {
    // Arrange
    const app = mockApp as INestApplication;

    // Act
    configureApp(app);

    // Assert
    expect(mockApp.setGlobalPrefix).toHaveBeenCalledWith('api');
    expect(mockApp.useGlobalPipes).toHaveBeenCalledTimes(1);
    const pipeArg = (mockApp.useGlobalPipes as jest.Mock).mock.calls[0][0];
    expect(pipeArg).toBeInstanceOf(ValidationPipe);

    expect(mockApp.useGlobalFilters).toHaveBeenCalledTimes(1);
    const filterArg = (mockApp.useGlobalFilters as jest.Mock).mock.calls[0][0];
    expect(filterArg).toBeInstanceOf(HttpExceptionFilter);
  });
});

