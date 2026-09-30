import {
  Body,
  Controller,
  Get,
  Head,
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
   * POST /api/v1/shipping/webhook/shiprocket (and keyword-safe aliases)
   * Public server-to-server Shiprocket tracking & shipment lifecycle webhook receiver.
   */
  @Post(["webhook/shiprocket", "webhook", "webhook/events", "events", "shiprocket"])
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
    if (typeof payload === "string") {
      try {
        payload = JSON.parse(payload);
      } catch {
        payload = { raw: payload };
      }
    } else if (Buffer.isBuffer(payload)) {
      try {
        payload = JSON.parse(payload.toString("utf8"));
      } catch {
        payload = { raw: payload.toString("utf8") };
      }
    } else if (payload === undefined || payload === null) {
      if (req.rawBody) {
        try {
          const rawStr = typeof req.rawBody === "string" ? req.rawBody : req.rawBody.toString("utf8");
          payload = rawStr ? JSON.parse(rawStr) : {};
        } catch {
          payload = {};
        }
      } else {
        payload = {};
      }
    }

    return this.shiprocketWebhookService.processWebhook({
      headers: headers || {},
      body: payload,
      rawBody: req.rawBody,
    });
  }

  /**
   * GET & HEAD probe handler
   * Supports Shiprocket dashboard or network connectivity test probes.
   */
  @Get(["webhook/shiprocket", "webhook", "webhook/events", "events", "shiprocket"])
  @Head(["webhook/shiprocket", "webhook", "webhook/events", "events", "shiprocket"])
  @HttpCode(HttpStatus.OK)
  handleProbe() {
    return {
      success: true,
      status: "active",
      message: "Shiprocket webhook endpoint is active and listening for POST events",
      endpoints: {
        primary: "/api/v1/shipping/webhook/shiprocket",
        keywordSafe: "/api/v1/shipping/webhook",
      },
    };
  }
}
