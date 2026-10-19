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
import { DelhiveryWebhookService } from "./delhivery-webhook.service";

@Controller("shipping")
export class DelhiveryWebhookController {
  constructor(
    private readonly delhiveryWebhookService: DelhiveryWebhookService,
  ) {}

  /**
   * POST /api/v1/shipping/webhook/delhivery
   * Dedicated Delhivery tracking & shipment lifecycle webhook receiver.
   */
  @Post(["webhook/delhivery", "delhivery"])
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
          const rawStr =
            typeof req.rawBody === "string"
              ? req.rawBody
              : req.rawBody.toString("utf8");
          payload = rawStr ? JSON.parse(rawStr) : {};
        } catch {
          payload = {};
        }
      } else {
        payload = {};
      }
    }

    return this.delhiveryWebhookService.processWebhook({
      headers: headers || {},
      body: payload,
      rawBody: req.rawBody,
    });
  }

  /**
   * GET & HEAD probe handler
   * Supports Delhivery portal or network connectivity verification probes.
   */
  @Get(["webhook/delhivery", "delhivery"])
  @Head(["webhook/delhivery", "delhivery"])
  @HttpCode(HttpStatus.OK)
  handleProbe() {
    return {
      success: true,
      status: "active",
      message:
        "Delhivery webhook endpoint is active and listening for POST events",
      endpoint: "/api/v1/shipping/webhook/delhivery",
    };
  }
}
