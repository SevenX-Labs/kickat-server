import { Test, TestingModule } from '@nestjs/testing';
import { InvoicePdfService } from './invoice-pdf.service';

describe('InvoicePdfService', () => {
  let service: InvoicePdfService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [InvoicePdfService],
    }).compile();

    service = module.get<InvoicePdfService>(InvoicePdfService);
  });

  it('1 & 6. Should generate PDF buffer for simple product order with correct grand total matching', async () => {
    const pdfBuffer = await service.generateInvoicePdf({
      orderNumber: 'ORD-1001',
      createdAt: new Date(),
      subtotal: 1000,
      gstPercentage: 18,
      gstAmount: 180,
      deliveryFee: 50,
      grandTotal: 1230,
      paymentMethod: 'UPI',
      paymentStatus: 'COMPLETED',
      items: [
        {
          productName: 'KickAt Running Shoes',
          quantity: 1,
          price: 1000,
          totalPrice: 1000,
        },
      ],
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(500);
  });

  it('2. Should generate PDF buffer for variable product order with variant', async () => {
    const pdfBuffer = await service.generateInvoicePdf({
      orderNumber: 'ORD-1002',
      createdAt: new Date(),
      subtotal: 1500,
      deliveryFee: 0,
      grandTotal: 1500,
      paymentMethod: 'CARD',
      paymentStatus: 'COMPLETED',
      items: [
        {
          productName: 'KickAt Pro Jersey',
          variantName: 'Size M / Blue',
          quantity: 1,
          price: 1500,
          totalPrice: 1500,
        },
      ],
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
    expect(pdfBuffer.length).toBeGreaterThan(500);
  });

  it('3. Should handle GST breakup (CGST & SGST)', async () => {
    const pdfBuffer = await service.generateInvoicePdf({
      orderNumber: 'ORD-1003',
      createdAt: new Date(),
      subtotal: 2000,
      gstPercentage: 18,
      gstAmount: 360,
      deliveryFee: 50,
      grandTotal: 2410,
      paymentMethod: 'UPI',
      paymentStatus: 'COMPLETED',
      items: [
        {
          productName: 'KickAt Leather Football',
          quantity: 2,
          price: 1000,
          totalPrice: 2000,
        },
      ],
      storeSettings: {
        gstNumber: '27AAAAA0000A1Z5',
      },
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
  });

  it('4. Should handle Delivery and COD charges', async () => {
    const pdfBuffer = await service.generateInvoicePdf({
      orderNumber: 'ORD-1004',
      createdAt: new Date(),
      subtotal: 1000,
      deliveryFee: 50,
      codFee: 30,
      extraFeeName: 'Packaging Fee',
      extraFeeAmount: 20,
      grandTotal: 1100,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      items: [
        {
          productName: 'KickAt Grip Socks',
          quantity: 2,
          price: 500,
          totalPrice: 1000,
        },
      ],
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
  });

  it('5. Should handle multiple products correctly', async () => {
    const pdfBuffer = await service.generateInvoicePdf({
      orderNumber: 'ORD-1005',
      createdAt: new Date(),
      subtotal: 3500,
      deliveryFee: 0,
      grandTotal: 3500,
      paymentMethod: 'NETBANKING',
      paymentStatus: 'COMPLETED',
      items: [
        { productName: 'Item A', quantity: 1, price: 1000, totalPrice: 1000 },
        { productName: 'Item B', variantName: 'Red', quantity: 2, price: 1000, totalPrice: 2000 },
        { productName: 'Item C', quantity: 1, price: 500, totalPrice: 500 },
      ],
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
  });

  it('8. Missing optional business information should not break PDF generation', async () => {
    const pdfBuffer = await service.generateInvoicePdf({
      orderNumber: 'ORD-1008',
      createdAt: new Date(),
      subtotal: 500,
      deliveryFee: 50,
      grandTotal: 550,
      paymentMethod: 'COD',
      paymentStatus: 'PENDING',
      items: [
        { productName: 'Basic Tee', quantity: 1, price: 500, totalPrice: 500 },
      ],
      user: null,
      address: null,
      storeSettings: null,
    });

    expect(pdfBuffer).toBeInstanceOf(Buffer);
  });
});
