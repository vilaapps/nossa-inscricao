import { HttpExceptionFilter } from './http-exception.filter';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { ArgumentsHost } from '@nestjs/common';
import { Request, Response } from 'express';

describe('HttpExceptionFilter', () => {
  let filter: HttpExceptionFilter;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    filter = new HttpExceptionFilter();
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function createMockHost(reqPartial: Partial<Request> = {}, resPartial: Partial<Response> = {}): ArgumentsHost {
    const mockJson = jest.fn();
    const mockStatus = jest.fn().mockReturnValue({ json: mockJson });

    const mockResponse = {
      status: mockStatus,
      json: mockJson,
      ...resPartial,
    } as unknown as Response;

    const mockRequest = {
      method: 'POST',
      url: '/api/registrations',
      headers: { origin: 'https://nossainscricao.com.br' },
      ...reqPartial,
    } as unknown as Request;

    return {
      switchToHttp: () => ({
        getRequest: () => mockRequest,
        getResponse: () => mockResponse,
      }),
    } as unknown as ArgumentsHost;
  }

  it('should handle HttpException with object response and log warning', () => {
    const host = createMockHost();
    const exception = new HttpException(
      { message: 'Invalid lot selection', error: 'Bad Request' },
      HttpStatus.BAD_REQUEST,
    );

    filter.catch(exception, host);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[POST] /api/registrations -> Status: 400'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Invalid lot selection'),
    );
  });

  it('should handle HttpException with string response', () => {
    const host = createMockHost();
    const exception = new HttpException('Forbidden resource', HttpStatus.FORBIDDEN);

    filter.catch(exception, host);

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('Forbidden resource'),
    );
  });

  it('should handle generic Error as 500 and log error with stack trace', () => {
    const host = createMockHost({ headers: { referer: 'https://nossainscricao.com.br/evento' } });
    const exception = new Error('Database connection failed');

    filter.catch(exception, host);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[POST] /api/registrations -> Status: 500'),
      expect.any(String),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('Database connection failed'),
      expect.any(String),
    );
  });

  it('should handle unknown non-Error exception with fallback origin', () => {
    const host = createMockHost({ headers: {} });
    const exception = 'Unexpected string error';

    filter.catch(exception, host);

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Origin: no-origin]'),
      undefined,
    );
  });
});
