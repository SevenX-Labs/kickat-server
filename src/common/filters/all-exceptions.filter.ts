import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Internal server error';
    let errors: any[] = [];

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const resPayload: any = exception.getResponse();

      if (typeof resPayload === 'string') {
        message = resPayload;
      } else if (typeof resPayload === 'object' && resPayload !== null) {
        message = resPayload.message || exception.message || message;
        if (Array.isArray(resPayload.message)) {
          errors = resPayload.message;
          message = errors[0] || message;
        }
      }
    } else if (
      typeof exception === 'object' &&
      exception !== null &&
      'code' in exception &&
      typeof (exception as any).code === 'string' &&
      (exception as any).code.startsWith('P')
    ) {
      const prismaCode = (exception as any).code;
      if (prismaCode === 'P2002') {
        status = HttpStatus.CONFLICT;
        message = 'A record with this unique value already exists.';
      } else if (prismaCode === 'P2025' || prismaCode === 'P2003') {
        status = HttpStatus.BAD_REQUEST;
        message = 'Invalid reference or record not found.';
      } else {
        status = HttpStatus.BAD_REQUEST;
        message = (exception as any).message || 'Database operation error.';
      }
    } else if (exception instanceof Error) {
      message = exception.message;
    }

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(
        `[${request.method}] ${request.url} - Status: ${status} - Error: ${message}`,
        exception instanceof Error ? exception.stack : undefined,
      );
    } else {
      this.logger.warn(
        `[${request.method}] ${request.url} - Status: ${status} - Error: ${message}`,
      );
    }

    const isProduction = process.env.NODE_ENV === 'production';
    const clientMessage =
      status >= HttpStatus.INTERNAL_SERVER_ERROR && isProduction
        ? 'Internal server error'
        : message;
    const clientErrors =
      status >= HttpStatus.INTERNAL_SERVER_ERROR && isProduction ? [] : errors;

    response.status(status).json({
      success: false,
      statusCode: status,
      message: clientMessage,
      path: request.url,
      timestamp: new Date().toISOString(),
      errors: clientErrors,
    });
  }
}
