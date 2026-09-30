import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  UsePipes,
  ValidationPipe,
} from "@nestjs/common";
import type { Request } from "express";
import { ShiprocketWebhookService } from "./shiprocket-webhook.service";

@Controller("shipping")
export class ShiprocketWebhookController {
  constructor(
    private readonly shiprocketWebhookService: ShiprocketWebhookService,
  ) {}

  /**
   * POST /api/v1/shipping/webhook/shiprocket
   * Public server-to-server Shiprocket tracking & shipment lifecycle webhook receiver.
   */
  @Post("webhook/shiprocket")
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
    return this.shiprocketWebhookService.processWebhook({
      headers,
      body,
      rawBody: req.rawBody,
    });
  }
}
