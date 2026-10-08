import { OrderStatusEnum } from '@prisma/client';
import { ShipmentTrackingSyncService } from './shipment-tracking-sync.service';

describe('ShipmentTrackingSyncService', () => {
  let prisma: any;
  let provider: any;
  let shippingService: any;
  let trackingEvents: any;
  let webhookService: any;
  let notifications: any;
  let service: ShipmentTrackingSyncService;

  const order = {
    id: 'ord-1',
    orderNumber: 'ORD-1',
    userId: 'user-1',
    orderStatus: OrderStatusEnum.SHIPPED,
    trackingNumber: 'AWB1',
    courierPartner: 'Delhivery',
    estimatedDelivery: null,
    shiprocketShipmentId: 'ship-1',
  };

  beforeEach(() => {
    prisma = {
      order: {
        findUnique: jest.fn().mockResolvedValue(order),
        findMany: jest.fn().mockResolvedValue([]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      },
    };
    provider = {
      providerName: 'SHIPROCKET',
      getShipmentTrackingByAwb: jest.fn().mockResolvedValue({
        awb: 'AWB1',
        activities: [
          {
            date: '2026-08-11 10:00:00',
            activity: 'Picked up',
            location: 'Hub A',
            'sr-status-label': 'PICKED UP',
          },
          {
            date: '2026-08-13 15:00:00',
            activity: 'Delivered',
            location: 'Pune',
            'sr-status-label': 'DELIVERED',
          },
        ],
      }),
    };
    shippingService = { getShippingProvider: jest.fn(() => provider) };
    trackingEvents = { recordEvents: jest.fn().mockResolvedValue(2) };
    // Real progression rules are exercised in the webhook spec; mirror the
    // relevant subset here.
    webhookService = {
      canAdvanceStatus: jest.fn(
        (from: OrderStatusEnum, to: OrderStatusEnum) =>
          from !== OrderStatusEnum.CANCELLED && from !== to,
      ),
    };
    notifications = { notifyOrderStatusChange: jest.fn() };
    service = new ShipmentTrackingSyncService(
      prisma,
      shippingService,
      trackingEvents,
      webhookService,
      notifications,
    );
  });

  it('pulls AWB tracking and stores it through the shared persistence path', async () => {
    const res = await service.syncOrderTracking('ord-1');

    expect(provider.getShipmentTrackingByAwb).toHaveBeenCalledWith('AWB1');
    expect(trackingEvents.recordEvents).toHaveBeenCalledWith(
      'ord-1',
      [
        expect.objectContaining({ stage: 'SHIPPED', location: 'Hub A' }),
        expect.objectContaining({ stage: 'DELIVERED', location: 'Pune' }),
      ],
      { source: 'POLL', awb: 'AWB1', shipmentId: 'ship-1' },
    );
    expect(res.newEvents).toBe(2);
  });

  it('advances a lagging order to the furthest forward status (missed webhook)', async () => {
    const res = await service.syncOrderTracking('ord-1');

    expect(prisma.order.updateMany).toHaveBeenCalledWith({
      where: { id: 'ord-1', orderStatus: OrderStatusEnum.SHIPPED },
      data: { orderStatus: OrderStatusEnum.DELIVERED },
    });
    expect(res.statusAdvancedTo).toBe(OrderStatusEnum.DELIVERED);
    expect(notifications.notifyOrderStatusChange).toHaveBeenCalledTimes(1);
  });

  it('never infers a forward status for an RTO shipment', async () => {
    provider.getShipmentTrackingByAwb.mockResolvedValue({
      awb: 'AWB1',
      activities: [
        {
          date: '2026-08-11 10:00:00',
          activity: 'OFD',
          'sr-status-label': 'OUT FOR DELIVERY',
        },
        {
          date: '2026-08-12 10:00:00',
          activity: 'RTO',
          'sr-status-label': 'RTO INITIATED',
        },
      ],
    });

    await service.syncOrderTracking('ord-1');

    expect(prisma.order.updateMany).not.toHaveBeenCalled();
  });

  it('skips orders without an AWB and providers without tracking', async () => {
    prisma.order.findUnique.mockResolvedValueOnce({
      ...order,
      trackingNumber: null,
    });
    expect((await service.syncOrderTracking('ord-1')).synced).toBe(false);

    delete provider.getShipmentTrackingByAwb;
    expect((await service.syncOrderTracking('ord-1')).synced).toBe(false);
    expect(await service.syncInTransitOrders()).toEqual({
      processed: 0,
      newEvents: 0,
    });
  });

  it('cron batch keeps going when one order fails', async () => {
    prisma.order.findMany.mockResolvedValue([
      { id: 'ord-1', orderNumber: 'ORD-1' },
      { id: 'ord-2', orderNumber: 'ORD-2' },
    ]);
    provider.getShipmentTrackingByAwb
      .mockRejectedValueOnce(new Error('Shiprocket 500'))
      .mockResolvedValueOnce({ awb: 'AWB1', activities: [] });
    trackingEvents.recordEvents.mockResolvedValue(0);

    const res = await service.handleInTransitTrackingSync();

    expect(res.processed).toBe(2);
    expect(provider.getShipmentTrackingByAwb).toHaveBeenCalledTimes(2);
    expect(prisma.order.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          trackingNumber: { not: null },
          orderStatus: {
            in: [
              OrderStatusEnum.PACKED,
              OrderStatusEnum.SHIPPED,
              OrderStatusEnum.OUT_FOR_DELIVERY,
              OrderStatusEnum.RETURN_INITIATED,
            ],
          },
        }),
      }),
    );
  });
});
