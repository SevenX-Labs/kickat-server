import { OrderTrackingEventsService } from './order-tracking-events.service';

describe('OrderTrackingEventsService', () => {
  let prisma: any;
  let service: OrderTrackingEventsService;

  beforeEach(() => {
    prisma = {
      orderTrackingEvent: {
        createMany: jest.fn().mockResolvedValue({ count: 2 }),
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
        findMany: jest.fn().mockResolvedValue([]),
      },
    };
    service = new OrderTrackingEventsService(prisma);
  });

  const timed = [
    {
      rawStatus: 'PICKED UP',
      stage: 'SHIPPED' as const,
      description: 'Picked up',
      location: 'Hub A',
      eventAt: new Date('2026-08-11T00:00:00Z'),
    },
    {
      rawStatus: 'IN TRANSIT',
      stage: 'IN_TRANSIT' as const,
      description: null,
      location: null,
      eventAt: new Date('2026-08-12T00:00:00Z'),
    },
  ];

  it('writes timed events with skipDuplicates so re-deliveries are no-ops', async () => {
    const inserted = await service.recordEvents('ord-1', timed, {
      source: 'WEBHOOK',
      awb: 'AWB1',
      shipmentId: 'ship-1',
    });

    expect(inserted).toBe(2);
    expect(prisma.orderTrackingEvent.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          orderId: 'ord-1',
          awb: 'AWB1',
          shipmentId: 'ship-1',
          source: 'WEBHOOK',
          rawStatus: 'PICKED UP',
          location: 'Hub A',
        }),
        expect.objectContaining({ rawStatus: 'IN TRANSIT', location: null }),
      ],
      skipDuplicates: true,
    });
  });

  it('reports zero new rows for a duplicate delivery', async () => {
    prisma.orderTrackingEvent.createMany.mockResolvedValue({ count: 0 });
    expect(
      await service.recordEvents('ord-1', timed, { source: 'WEBHOOK' }),
    ).toBe(0);
  });

  it('records a timestamp-less status only once', async () => {
    const untimed = [
      {
        rawStatus: 'Out For Delivery',
        stage: 'OUT_FOR_DELIVERY' as const,
        description: null,
        location: null,
        eventAt: null,
      },
    ];

    expect(
      await service.recordEvents('ord-1', untimed, { source: 'WEBHOOK' }),
    ).toBe(1);
    expect(prisma.orderTrackingEvent.create).toHaveBeenCalledTimes(1);

    prisma.orderTrackingEvent.findFirst.mockResolvedValue({ id: 'evt-1' });
    expect(
      await service.recordEvents('ord-1', untimed, { source: 'WEBHOOK' }),
    ).toBe(0);
    expect(prisma.orderTrackingEvent.create).toHaveBeenCalledTimes(1);
  });

  it('does nothing for an empty event list', async () => {
    expect(await service.recordEvents('ord-1', [], { source: 'POLL' })).toBe(0);
    expect(prisma.orderTrackingEvent.createMany).not.toHaveBeenCalled();
  });
});
