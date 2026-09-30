import { Test, TestingModule } from "@nestjs/testing";
import { ShiprocketWebhookController } from "./shiprocket-webhook.controller";
import { ShiprocketWebhookService } from "./shiprocket-webhook.service";

describe("ShiprocketWebhookController", () => {
  let controller: ShiprocketWebhookController;
  let webhookService: any;

  beforeEach(async () => {
    webhookService = {
      processWebhook: jest.fn().mockResolvedValue({
        success: true,
        message: "Shiprocket webhook processed successfully",
        matched: true,
      }),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [ShiprocketWebhookController],
      providers: [
        { provide: ShiprocketWebhookService, useValue: webhookService },
      ],
    }).compile();

    controller = module.get<ShiprocketWebhookController>(
      ShiprocketWebhookController,
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it("should be defined", () => {
    expect(controller).toBeDefined();
  });

  it("should delegate incoming webhook payload to ShiprocketWebhookService", async () => {
    const headers = { "x-api-key": "test_token" };
    const body = { shipment_id: "1617036672", current_status: "DELIVERED" };
    const req = { rawBody: Buffer.from(JSON.stringify(body)) } as any;

    const response = await controller.handleWebhook(headers, req, body);

    expect(response).toEqual({
      success: true,
      message: "Shiprocket webhook processed successfully",
      matched: true,
    });
    expect(webhookService.processWebhook).toHaveBeenCalledWith({
      headers,
      body,
      rawBody: req.rawBody,
    });
  });

  it("should acknowledge GET probe requests with 200 OK", () => {
    const probeResponse = controller.handleProbe();
    expect(probeResponse.success).toBe(true);
    expect(probeResponse.status).toBe("active");
  });
});
