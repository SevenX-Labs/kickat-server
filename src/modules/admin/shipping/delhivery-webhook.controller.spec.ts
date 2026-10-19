import { HttpStatus } from "@nestjs/common";
import { DelhiveryWebhookController } from "./delhivery-webhook.controller";

describe("DelhiveryWebhookController", () => {
  let controller: DelhiveryWebhookController;
  let webhookService: any;

  beforeEach(() => {
    webhookService = {
      processWebhook: jest.fn().mockResolvedValue({
        success: true,
        message: "Delhivery webhook processed successfully",
      }),
    };

    controller = new DelhiveryWebhookController(webhookService);
  });

  it("handles GET probe check", () => {
    const result = controller.handleProbe();
    expect(result.success).toBe(true);
    expect(result.status).toBe("active");
    expect(result.endpoint).toBe("/api/v1/shipping/webhook/delhivery");
  });

  it("processes incoming POST webhook payload and headers", async () => {
    const headers = { "x-delhivery-secret": "test_secret" };
    const body = {
      Shipment: {
        AWB: "DEL998877",
        Status: { Status: "Delivered", StatusType: "DL" },
      },
    };
    const req: any = {};

    const res = await controller.handleWebhook(headers, req, body);
    expect(res.success).toBe(true);
    expect(webhookService.processWebhook).toHaveBeenCalledWith({
      headers,
      body,
      rawBody: undefined,
    });
  });

  it("parses JSON string payload when passed as string", async () => {
    const headers = { "x-delhivery-secret": "test_secret" };
    const body = JSON.stringify({
      Shipment: { AWB: "DEL998877" },
    });
    const req: any = {};

    await controller.handleWebhook(headers, req, body);
    expect(webhookService.processWebhook).toHaveBeenCalledWith({
      headers,
      body: { Shipment: { AWB: "DEL998877" } },
      rawBody: undefined,
    });
  });
});
