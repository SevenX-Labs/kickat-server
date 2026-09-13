import { Injectable, Logger } from "@nestjs/common";
import { Cron, CronExpression } from "@nestjs/schedule";
import { PrismaService } from "../../prisma/prisma.service";

@Injectable()
export class StockReservationCleanupService {
  private readonly logger = new Logger(StockReservationCleanupService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Periodically clean up expired, unfulfilled stock reservations.
   * Runs every 5 minutes safely & atomically.
   */
  @Cron(CronExpression.EVERY_5_MINUTES)
  async handleExpiredReservations() {
    this.logger.log("Starting stock reservation expiration cleanup scan...");
    try {
      const result = await this.cleanupExpiredReservations();
      this.logger.log(`Stock reservation cleanup scan completed. Cleaned: ${result.cleanedCount}`);
      return result;
    } catch (error: any) {
      this.logger.error("Error during stock reservation cleanup scan", error?.stack || error);
    }
  }

  async cleanupExpiredReservations() {
    const expiredReservations = await this.prisma.stockReservation.findMany({
      where: {
        isFulfilled: false,
        expiresAt: { lte: new Date() },
      },
      take: 100, // Batch limit per cycle
    });

    if (expiredReservations.length === 0) {
      return { cleanedCount: 0 };
    }

    let cleanedCount = 0;

    for (const res of expiredReservations) {
      try {
        const processed = await this.prisma.$transaction(async (tx) => {
          // Atomically update reservation to fulfilled/expired state so no concurrent process claims it
          const updated = await tx.stockReservation.updateMany({
            where: {
              id: res.id,
              isFulfilled: false,
            },
            data: {
              isFulfilled: true,
            },
          });

          if (updated.count === 0) {
            // Already handled or converted by order completion / concurrent job
            return false;
          }

          return true;
        });

        if (processed) {
          cleanedCount++;
        }
      } catch (err: any) {
        this.logger.warn(`Failed to clean expired stock reservation ${res.id}: ${err.message}`);
      }
    }

    return { cleanedCount };
  }
}
