import { LoggingMiddleware } from './logging.middleware';
import { Logger } from '@nestjs/common';
import { Request, Response, NextFunction } from 'express';

describe('LoggingMiddleware', () => {
  let middleware: LoggingMiddleware;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    middleware = new LoggingMiddleware();
    logSpy = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
    warnSpy = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    errorSpy = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should call next and log successful request (2xx)', () => {
    let finishCallback: () => void = () => {};

    const req = {
      method: 'GET',
      originalUrl: '/api/events',
      headers: { origin: 'https://nossainscricao.com.br' },
    } as unknown as Request;

    const res = {
      statusCode: 200,
      on: jest.fn((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      }),
    } as unknown as Response;

    const next: NextFunction = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    finishCallback();
    expect(logSpy).toHaveBeenCalledWith(
      expect.stringContaining('[GET] /api/events -> 200'),
    );
  });

  it('should log warning for 4xx client errors using referer fallback when origin is missing', () => {
    let finishCallback: () => void = () => {};

    const req = {
      method: 'POST',
      originalUrl: '/api/registrations',
      headers: { referer: 'https://nossainscricao.com.br/checkout' },
    } as unknown as Request;

    const res = {
      statusCode: 400,
      on: jest.fn((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      }),
    } as unknown as Response;

    const next: NextFunction = jest.fn();

    middleware.use(req, res, next);
    expect(next).toHaveBeenCalledTimes(1);

    finishCallback();
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[POST] /api/registrations -> 400'),
    );
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Origin: https://nossainscricao.com.br/checkout]'),
    );
  });

  it('should log error for 5xx server errors with no-origin fallback', () => {
    let finishCallback: () => void = () => {};

    const req = {
      method: 'DELETE',
      originalUrl: '/api/events/123',
      headers: {},
    } as unknown as Request;

    const res = {
      statusCode: 500,
      on: jest.fn((event, cb) => {
        if (event === 'finish') finishCallback = cb;
      }),
    } as unknown as Response;

    const next: NextFunction = jest.fn();

    middleware.use(req, res, next);
    finishCallback();

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[DELETE] /api/events/123 -> 500'),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('[Origin: no-origin]'),
    );
  });
});
