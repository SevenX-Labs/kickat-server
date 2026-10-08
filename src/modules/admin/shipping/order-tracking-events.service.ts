import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../../prisma/prisma.service';
import {
  ParsedTrackingEvent,
  StoredTrackingEvent,
  TrackingEventSource,
} from './tracking-events.util';

/**
 * Single persistence path for real courier tracking events, shared by the
 * Shiprocket webhook and the AWB tracking sync.
 *
 * Idempotent: rows are unique on (orderId, rawStatus, eventAt), so re-delivered
 * webhooks and repeated polls never create duplicates.
 */
@Injectable()
export class OrderTrackingEventsService {
  private readonly logger = new Logger(OrderTrackingEventsService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Persists events for an order. Returns the number of NEW rows written.
   */
  async recordEvents(
    orderId: string,
    events: ParsedTrackingEvent[],
    context: {
      source: TrackingEventSource;
      awb?: string | null;
      shipmentId?: string | null;
    },
  ): Promise<number> {
    if (!orderId || events.length === 0) return 0;

    const base = {
      orderId,
      awb: context.awb || null,
      shipmentId: context.shipmentId || null,
      source: context.source,
    };

    let inserted = 0;

    const timed = events.filter((e) => e.eventAt);
    if (timed.length > 0) {
      const res = await this.prisma.orderTrackingEvent.createMany({
        data: timed.map((e) => ({
          ...base,
          rawStatus: e.rawStatus,
          stage: e.stage,
          description: e.description,
          location: e.location,
          eventAt: e.eventAt as Date,
        })),
        skipDuplicates: true,
      });
      inserted += res.count;
    }

    // A status the provider reported without any timestamp is recorded once,
    // at the time KickAt received it.
    for (const e of events.filter((ev) => !ev.eventAt)) {
      const existing = await this.prisma.orderTrackingEvent.findFirst({
        where: { orderId, rawStatus: e.rawStatus },
        select: { id: true },
      });
      if (existing) continue;

      try {
        await this.prisma.orderTrackingEvent.create({
          data: {
            ...base,
            rawStatus: e.rawStatus,
            stage: e.stage,
            description: e.description,
            location: e.location,
            eventAt: new Date(),
          },
        });
        inserted++;
      } catch (err: any) {
        if (err?.code !== 'P2002') throw err;
      }
    }

    if (inserted > 0) {
      this.logger.log(
        `Recorded ${inserted} new tracking event(s) for order ${orderId} (source=${context.source}).`,
      );
    }

    return inserted;
  }

  /** Persisted events for an order, oldest first. */
  async getEventsForOrder(orderId: string): Promise<StoredTrackingEvent[]> {
    return this.prisma.orderTrackingEvent.findMany({
      where: { orderId },
      orderBy: [{ eventAt: 'asc' }, { createdAt: 'asc' }],
      select: {
        rawStatus: true,
        stage: true,
        description: true,
        location: true,
        eventAt: true,
        source: true,
      },
    });
  }
}
