import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Get('health')
  getHealth() {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  @Get('ready')
  async getReady() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return {
        status: 'ready',
        database: 'connected',
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      return {
        status: 'not_ready',
        database: 'disconnected',
        error: error instanceof Error ? error.message : 'Database error',
        timestamp: new Date().toISOString(),
      };
    }
  }

  @Get('metrics')
  async getMetrics() {
    const memoryUsage = process.memoryUsage();
    return {
      node_version: process.version,
      uptime_seconds: process.uptime(),
      memory_rss_bytes: memoryUsage.rss,
      memory_heap_total_bytes: memoryUsage.heapTotal,
      memory_heap_used_bytes: memoryUsage.heapUsed,
      timestamp: new Date().toISOString(),
    };
  }
}
