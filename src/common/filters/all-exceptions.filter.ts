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
