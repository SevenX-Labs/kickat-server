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
    courierPartner: 'Ekart',
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
      orderReturn: {
        findMany: jest.fn().mockResolvedValue([]),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    provider = {
      providerName: 'EKART',
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
    provider.getReturnTracking = jest.fn().mockResolvedValue({
      isConfigured: true,
      providerName: 'Ekart',
      shipmentId: 'RET-AWB1',
      currentStatus: 'In Transit',
      checkpoints: [
        { status: 'Picked Up', location: 'Hub A', timestamp: '2026-08-11T10:00:00Z' },
      ],
    });
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
    notifications = {
      notifyOrderStatusChange: jest.fn(),
      notifyReturnStatus: jest.fn(),
    };
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
      .mockRejectedValueOnce(new Error('Ekart 500'))
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

  // ── Return Shipment Sync ──────────────────────────────────────────────

  it('polls return AWBs and advances status based on tracking data', async () => {
    prisma.orderReturn.findMany.mockResolvedValue([
      {
        id: 'ret-1',
        returnAwb: 'RET-AWB1',
        status: 'PICKUP_SCHEDULED',
        orderId: 'ord-1',
        order: { id: 'ord-1', orderNumber: 'ORD-1', userId: 'user-1' },
      },
    ]);
    provider.getReturnTracking.mockResolvedValue({
      isConfigured: true,
      providerName: 'Ekart',
      shipmentId: 'RET-AWB1',
      currentStatus: 'In Transit',
      checkpoints: [
        { status: 'Picked Up', location: 'Hub A', timestamp: '2026-08-11T10:00:00Z' },
        { status: 'In Transit', location: 'Hub B', timestamp: '2026-08-12T10:00:00Z' },
      ],
    });

    const res = await service.syncInTransitOrders();

    expect(provider.getReturnTracking).toHaveBeenCalledWith('RET-AWB1');
    expect(prisma.orderReturn.update).toHaveBeenCalledWith({
      where: { id: 'ret-1' },
      data: { status: 'IN_TRANSIT' },
    });
    expect(res.processed).toBeGreaterThanOrEqual(1);
  });

  it('advances return to RETURN_RECEIVED and sends notification', async () => {
    prisma.orderReturn.findMany.mockResolvedValue([
      {
        id: 'ret-2',
        returnAwb: 'RET-AWB2',
        status: 'IN_TRANSIT',
        orderId: 'ord-1',
        order: { id: 'ord-1', orderNumber: 'ORD-1', userId: 'user-1' },
      },
    ]);
    provider.getReturnTracking.mockResolvedValue({
      isConfigured: true,
      providerName: 'Ekart',
      shipmentId: 'RET-AWB2',
      currentStatus: 'Delivered',
      checkpoints: [
        { status: 'Delivered', location: 'Warehouse', timestamp: '2026-08-15T10:00:00Z' },
      ],
    });

    await service.syncInTransitOrders();

    expect(prisma.orderReturn.update).toHaveBeenCalledWith({
      where: { id: 'ret-2' },
      data: expect.objectContaining({
        status: 'RETURN_RECEIVED',
        refundedAt: expect.any(Date),
      }),
    });
    expect(notifications.notifyReturnStatus).toHaveBeenCalledWith({
      orderId: 'ord-1',
      orderNumber: 'ORD-1',
      userId: 'user-1',
      status: 'RETURN_RECEIVED',
    });
  });

  it('never moves a return backward in status', async () => {
    prisma.orderReturn.findMany.mockResolvedValue([
      {
        id: 'ret-3',
        returnAwb: 'RET-AWB3',
        status: 'IN_TRANSIT',
        orderId: 'ord-1',
        order: { id: 'ord-1', orderNumber: 'ORD-1', userId: 'user-1' },
      },
    ]);
    provider.getReturnTracking.mockResolvedValue({
      isConfigured: true,
      providerName: 'Ekart',
      shipmentId: 'RET-AWB3',
      currentStatus: 'Picked Up',
      checkpoints: [
        { status: 'Picked Up', location: 'Hub A', timestamp: '2026-08-11T10:00:00Z' },
      ],
    });

    await service.syncInTransitOrders();

    expect(prisma.orderReturn.update).not.toHaveBeenCalled();
  });

  it('skips returns when provider lacks getReturnTracking', async () => {
    delete provider.getReturnTracking;
    prisma.orderReturn.findMany.mockResolvedValue([
      {
        id: 'ret-4',
        returnAwb: 'RET-AWB4',
        status: 'PICKUP_SCHEDULED',
        orderId: 'ord-1',
        order: { id: 'ord-1', orderNumber: 'ORD-1', userId: 'user-1' },
      },
    ]);

    const res = await service.syncInTransitOrders();

    expect(prisma.orderReturn.update).not.toHaveBeenCalled();
    expect(res.processed).toBe(0);
  });
});
