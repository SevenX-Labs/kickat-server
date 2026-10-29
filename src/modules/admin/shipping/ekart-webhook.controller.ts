import {
  Body,
  Controller,
  Get,
  Head,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Headers,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import type { Request } from 'express';
import { EkartWebhookService } from './ekart-webhook.service';

@Controller('shipping')
export class EkartWebhookController {
  constructor(private readonly ekartWebhookService: EkartWebhookService) {}

  @Post(['webhook/ekart', 'ekart'])
  @HttpCode(HttpStatus.OK)
  @UsePipes(
    new ValidationPipe({
      whitelist: false,
      transform: true,
      forbidNonWhitelisted: false,
    }),
  )
  async handleWebhook(
    @Headers() headers: Record<string, any>,
    @Req() req: Request & { rawBody?: Buffer | string },
    @Body() body: any,
  ) {
    let payload = body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = { raw: payload };
      }
    } else if (Buffer.isBuffer(payload)) {
      try {
        payload = JSON.parse(payload.toString('utf8'));
      } catch {
        payload = { raw: payload.toString('utf8') };
      }
    } else if (payload === undefined || payload === null) {
      if (req.rawBody) {
        try {
          const rawStr =
            typeof req.rawBody === 'string'
              ? req.rawBody
              : req.rawBody.toString('utf8');
          payload = rawStr ? JSON.parse(rawStr) : {};
        } catch {
          payload = {};
        }
      } else {
        payload = {};
      }
    }

    return this.ekartWebhookService.processWebhook({
      headers: headers || {},
      body: payload,
      rawBody: req.rawBody,
    });
  }

  @Get(['webhook/ekart', 'ekart'])
  @Head(['webhook/ekart', 'ekart'])
  @HttpCode(HttpStatus.OK)
  handleProbe() {
    return {
      success: true,
      status: 'active',
      message:
        'Ekart webhook endpoint is active and listening for POST events',
      endpoint: '/api/v1/shipping/webhook/ekart',
    };
  }
}
