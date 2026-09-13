import { Test, TestingModule } from "@nestjs/testing";
import { StockReservationCleanupService } from "./stock-reservation-cleanup.service";
import { PrismaService } from "../../prisma/prisma.service";

describe("StockReservationCleanupService", () => {
  let service: StockReservationCleanupService;

  const mockPrismaService = {
    stockReservation: {
      findMany: jest.fn(),
      updateMany: jest.fn(),
    },
    $transaction: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StockReservationCleanupService,
        { provide: PrismaService, useValue: mockPrismaService },
      ],
    }).compile();

    service = module.get<StockReservationCleanupService>(StockReservationCleanupService);
  });

  it("1. Non-expired / valid reservations are untouched", async () => {
    mockPrismaService.stockReservation.findMany.mockResolvedValue([]);
    const res = await service.cleanupExpiredReservations();

    expect(res.cleanedCount).toBe(0);
    expect(mockPrismaService.$transaction).not.toHaveBeenCalled();
  });

  it("2 & 3. Expired unfulfilled reservation is detected and safely marked fulfilled", async () => {
    mockPrismaService.stockReservation.findMany.mockResolvedValue([
      { id: "res1", userId: "u1", isFulfilled: false, expiresAt: new Date(Date.now() - 60000) },
    ]);
    mockPrismaService.$transaction.mockImplementation(async (cb) => {
      mockPrismaService.stockReservation.updateMany.mockResolvedValue({ count: 1 });
      return cb(mockPrismaService);
    });

    const res = await service.cleanupExpiredReservations();
    expect(res.cleanedCount).toBe(1);
  });

  it("6 & 7. Same reservation cannot be cleaned twice concurrently", async () => {
    mockPrismaService.stockReservation.findMany.mockResolvedValue([
      { id: "res1", userId: "u1", isFulfilled: false, expiresAt: new Date(Date.now() - 60000) },
    ]);
    mockPrismaService.$transaction.mockImplementation(async (cb) => {
      mockPrismaService.stockReservation.updateMany.mockResolvedValue({ count: 0 }); // Already updated
      return cb(mockPrismaService);
    });

    const res = await service.cleanupExpiredReservations();
    expect(res.cleanedCount).toBe(0);
  });

  it("11. One failed reservation cleanup does not stop others from processing", async () => {
    mockPrismaService.stockReservation.findMany.mockResolvedValue([
      { id: "resErr", userId: "u1", isFulfilled: false, expiresAt: new Date(Date.now() - 60000) },
      { id: "resOk", userId: "u2", isFulfilled: false, expiresAt: new Date(Date.now() - 60000) },
    ]);
    mockPrismaService.$transaction
      .mockRejectedValueOnce(new Error("DB Error"))
      .mockImplementationOnce(async (cb) => {
        mockPrismaService.stockReservation.updateMany.mockResolvedValue({ count: 1 });
        return cb(mockPrismaService);
      });

    const res = await service.cleanupExpiredReservations();
    expect(res.cleanedCount).toBe(1);
  });
});
