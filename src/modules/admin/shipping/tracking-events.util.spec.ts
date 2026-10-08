import { OrderStatusEnum, PaymentMethodEnum } from '@prisma/client';
import {
  buildTrackingTimeline,
  extractShiprocketWebhookEvents,
  getLatestEventLocation,
  getTrackingPlaceholderMessage,
  mapProviderStatusToStage,
  parseProviderTimestamp,
  parseShiprocketScan,
  serializeTrackingEvents,
  StoredTrackingEvent,
} from './tracking-events.util';

describe('tracking-events.util', () => {
  describe('parseProviderTimestamp', () => {
    it('treats zone-less Shiprocket scan dates as IST', () => {
      expect(parseProviderTimestamp('2023-05-19 11:59:16')?.toISOString()).toBe(
        '2023-05-19T06:29:16.000Z',
      );
    });

    it('parses the webhook current_timestamp format (DD MM YYYY)', () => {
      expect(parseProviderTimestamp('23 05 2023 11:43:52')?.toISOString()).toBe(
        '2023-05-23T06:13:52.000Z',
      );
    });

    it('honours an explicit zone and rejects garbage', () => {
      expect(
        parseProviderTimestamp('2023-05-19T06:00:00Z')?.toISOString(),
      ).toBe('2023-05-19T06:00:00.000Z');
      expect(parseProviderTimestamp('yesterday')).toBeNull();
      expect(parseProviderTimestamp(null)).toBeNull();
    });
  });

  describe('mapProviderStatusToStage', () => {
    it('maps textual statuses and confident numeric codes', () => {
      expect(mapProviderStatusToStage('Out For Delivery')).toBe(
        'OUT_FOR_DELIVERY',
      );
      expect(mapProviderStatusToStage('IN-TRANSIT')).toBe('IN_TRANSIT');
      expect(mapProviderStatusToStage('RTO Delivered')).toBe('RTO_DELIVERED');
      expect(mapProviderStatusToStage(null, 7)).toBe('DELIVERED');
      expect(mapProviderStatusToStage('Undelivered')).toBeNull();
    });
  });

  describe('parseShiprocketScan', () => {
    it('keeps provider text and location verbatim', () => {
      const event = parseShiprocketScan({
        date: '2023-05-19 11:59:16',
        status: 'X-PPOM',
        activity: 'Shipment picked up',
        location: 'Chomu_SamodRd_D (Rajasthan)',
        'sr-status': '42',
        'sr-status-label': 'PICKED UP',
      });
      expect(event).toEqual({
        rawStatus: 'PICKED UP',
        stage: 'SHIPPED',
        description: 'Shipment picked up',
        location: 'Chomu_SamodRd_D (Rajasthan)',
        eventAt: new Date('2023-05-19T06:29:16.000Z'),
      });
    });

    it('uses the courier status when the label is NA and never invents a location', () => {
      const event = parseShiprocketScan({
        date: '2023-05-20 08:00:00',
        status: 'X-ILL2F',
        activity: 'Bag added to trip',
        location: 'NA',
        'sr-status': 'NA',
        'sr-status-label': 'NA',
      });
      expect(event?.rawStatus).toBe('X-ILL2F');
      expect(event?.stage).toBe('UPDATE');
      expect(event?.location).toBeNull();
    });

    it('drops scans that cannot be placed in time', () => {
      expect(parseShiprocketScan({ activity: 'Delivered' })).toBeNull();
    });
  });

  describe('extractShiprocketWebhookEvents', () => {
    it('returns every scan and skips the current status when already covered', () => {
      const events = extractShiprocketWebhookEvents({
        awb: '59629792084',
        current_status: 'Delivered',
        current_status_id: 7,
        current_timestamp: '23 05 2023 11:43:52',
        scans: [
          {
            date: '2023-05-19 11:59:16',
            activity: 'Picked up',
            'sr-status-label': 'PICKED UP',
          },
          {
            date: '2023-05-23 11:43:52',
            activity: 'Delivered',
            'sr-status-label': 'DELIVERED',
          },
        ],
      });
      expect(events.map((e) => e.stage)).toEqual(['SHIPPED', 'DELIVERED']);
    });

    it('records the current status when the payload has no scans', () => {
      const events = extractShiprocketWebhookEvents({
        current_status: 'OUT FOR DELIVERY',
        current_timestamp: '23 05 2023 09:00:00',
      });
      expect(events).toHaveLength(1);
      expect(events[0].stage).toBe('OUT_FOR_DELIVERY');
      expect(events[0].location).toBeNull();
    });
  });

  describe('buildTrackingTimeline', () => {
    const order = {
      orderStatus: OrderStatusEnum.SHIPPED,
      paymentMethod: PaymentMethodEnum.UPI,
      createdAt: new Date('2026-08-10T10:00:00Z'),
      courierPartner: 'Delhivery',
      trackingNumber: 'AWB1',
    };
    const ev = (
      stage: string,
      iso: string,
      location: string | null = null,
    ): StoredTrackingEvent => ({
      rawStatus: stage,
      stage,
      description: `${stage} msg`,
      location,
      eventAt: new Date(iso),
      source: 'WEBHOOK',
    });

    it('lists real events chronologically with the latest as current', () => {
      const timeline = buildTrackingTimeline(order, [
        ev('IN_TRANSIT', '2026-08-12T00:00:00Z', 'Pune Hub'),
        ev('SHIPPED', '2026-08-11T00:00:00Z'),
      ]);
      expect(timeline.map((t) => t.stage)).toEqual([
        'ORDER_PLACED',
        'SHIPPED',
        'IN_TRANSIT',
      ]);
      expect(timeline[1].location).toBeNull();
      expect(timeline[2].location).toBe('Pune Hub');
      expect(timeline[2].isCurrent).toBe(true);
      expect(timeline.filter((t) => t.isCurrent)).toHaveLength(1);
    });

    it('reflects final delivery from a delivered event', () => {
      const timeline = buildTrackingTimeline(
        { ...order, orderStatus: OrderStatusEnum.DELIVERED },
        [
          ev('SHIPPED', '2026-08-11T00:00:00Z'),
          ev('DELIVERED', '2026-08-13T00:00:00Z'),
        ],
      );
      const last = timeline[timeline.length - 1];
      expect(last.stage).toBe('DELIVERED');
      expect(last.isCurrent).toBe(true);
      expect(last.timestamp).toEqual(new Date('2026-08-13T00:00:00Z'));
    });

    it('ends a cancelled order at CANCELLED with no delivery stages after it', () => {
      const timeline = buildTrackingTimeline(
        {
          ...order,
          orderStatus: OrderStatusEnum.CANCELLED,
          cancelledAt: new Date('2026-08-12T00:00:00Z'),
        },
        [
          ev('PACKED', '2026-08-11T00:00:00Z'),
          ev('CANCELLED', '2026-08-12T01:00:00Z'),
          ev('DELIVERED', '2026-08-14T00:00:00Z'),
        ],
      );
      expect(timeline.map((t) => t.stage)).toEqual([
        'ORDER_PLACED',
        'PACKED',
        'CANCELLED',
      ]);
      expect(timeline[timeline.length - 1].isCurrent).toBe(true);
    });

    it('falls back to a summary with no invented locations or timestamps', () => {
      const timeline = buildTrackingTimeline(order, []);
      expect(timeline).toHaveLength(6);
      for (const step of timeline.slice(1)) {
        expect(step.location).toBeNull();
        expect(step.timestamp).toBeNull();
      }
      expect(timeline.find((t) => t.stage === 'SHIPPED')?.isCompleted).toBe(
        true,
      );
      expect(timeline.find((t) => t.stage === 'IN_TRANSIT')?.isCompleted).toBe(
        false,
      );
    });

    it('describes COD orders without claiming payment was verified', () => {
      const timeline = buildTrackingTimeline(
        { ...order, paymentMethod: PaymentMethodEnum.COD },
        [],
      );
      expect(timeline[0].description).toContain('Cash on Delivery');
    });
  });

  describe('helpers', () => {
    it('shows the truthful placeholder only when there are no events', () => {
      const base = {
        orderStatus: OrderStatusEnum.PLACED,
        createdAt: new Date(),
      };
      expect(getTrackingPlaceholderMessage(base, [])).toBe(
        'Tracking will appear once the shipment is picked up.',
      );
      expect(
        getTrackingPlaceholderMessage(
          { ...base, orderStatus: OrderStatusEnum.CANCELLED },
          [],
        ),
      ).toBeNull();
    });

    it('serializes chronologically and picks the latest known location', () => {
      const events: StoredTrackingEvent[] = [
        {
          rawStatus: 'B',
          stage: 'IN_TRANSIT',
          description: null,
          location: 'Hub B',
          eventAt: new Date('2026-01-02'),
          source: 'POLL',
        },
        {
          rawStatus: 'A',
          stage: 'SHIPPED',
          description: null,
          location: 'Hub A',
          eventAt: new Date('2026-01-01'),
          source: 'WEBHOOK',
        },
        {
          rawStatus: 'C',
          stage: 'UPDATE',
          description: 'x',
          location: null,
          eventAt: new Date('2026-01-03'),
          source: 'POLL',
        },
      ];
      expect(serializeTrackingEvents(events).map((e) => e.rawStatus)).toEqual([
        'A',
        'B',
        'C',
      ]);
      expect(getLatestEventLocation(events)).toBe('Hub B');
    });
  });
});
