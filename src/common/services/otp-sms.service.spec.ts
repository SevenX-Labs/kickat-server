import { ConfigService } from '@nestjs/config';
import { OtpSmsService } from './otp-sms.service';

describe('OtpSmsService', () => {
  let service: OtpSmsService;
  let configService: jest.Mocked<ConfigService>;

  beforeEach(() => {
    configService = {
      get: jest.fn(),
    } as any;
    service = new OtpSmsService(configService);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('should reject invalid phone numbers', async () => {
    const res = await service.sendOtpSms('123', '123456');
    expect(res.success).toBe(false);
    expect(res.message).toContain('Invalid 10-digit phone number format');
  });

  it('should fall back gracefully when OTP_API_KEY is not configured', async () => {
    configService.get.mockReturnValue(null);
    delete process.env.OTP_API_KEY;
    delete process.env.FAST2SMS_API_KEY;

    const res = await service.sendOtpSms('9876543210', '123456');
    expect(res.success).toBe(true);
    expect(res.message).toContain('logged locally for development');
  });

  it('should dispatch OTP successfully via Nexus Gateway', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'OTP_API_KEY') return 'sk_live_test_key';
      if (key === 'OTP_API_URL') return 'https://apinexusotp.vercel.app/api/v1/otp/send';
      return null;
    });

    const mockFetch = jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        success: true,
        transaction_id: 'TXN_TEST_123',
        message: 'OTP sent successfully',
      }),
    } as any);

    const res = await service.sendOtpSms('+91 98765-43210', '482910');

    expect(mockFetch).toHaveBeenCalledWith(
      'https://apinexusotp.vercel.app/api/v1/otp/send',
      expect.objectContaining({
        method: 'POST',
        headers: {
          Authorization: 'Bearer sk_live_test_key',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          phone: '9876543210',
          otp: '482910',
        }),
      }),
    );
    expect(res.success).toBe(true);
    expect(res.transactionId).toBe('TXN_TEST_123');
  });

  it('should handle gateway errors gracefully without throwing', async () => {
    configService.get.mockImplementation((key: string) => {
      if (key === 'OTP_API_KEY') return 'sk_live_test_key';
      return null;
    });

    jest.spyOn(global, 'fetch' as any).mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        success: false,
        error_code: 'NUMBER_BLOCKED_DND',
        message: 'Number in DND',
      }),
    } as any);

    const res = await service.sendOtpSms('9876543210', '123456');

    expect(res.success).toBe(false);
    expect(res.errorCode).toBe('NUMBER_BLOCKED_DND');
    expect(res.message).toBe('Number in DND');
  });
});
