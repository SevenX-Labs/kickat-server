import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
import { RedisModule } from './common/redis/redis.module';
import { RedisService } from './common/redis/redis.service';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';

import { ScheduleModule } from '@nestjs/schedule';
import { ProfileModule } from './modules/profile/profile.module';
import { HomeModule } from './modules/home/home.module';
import { SearchModule } from './modules/search/search.module';
import { ProductsModule } from './modules/products/products.module';
import { CompareModule } from './modules/compare/compare.module';
import { WishlistModule } from './modules/wishlist/wishlist.module';
import { CartModule } from './modules/cart/cart.module';
import { CheckoutModule } from './modules/checkout/checkout.module';
import { PaymentsModule } from './modules/payments/payments.module';
import { OrdersModule } from './modules/orders/orders.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { RecommendationModule } from './modules/recommendation/recommendation.module';
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AuditService } from './common/services/audit.service';
import { OtpCacheService } from './common/services/otp-cache.service';
import { ThrottlerModule, ThrottlerGuard, minutes, hours } from '@nestjs/throttler';
import { RedisThrottlerStorage, AppThrottlerGuard } from './common';
import { CategoriesModule } from './modules/categories/categories.module';
import { AuthModule as AdminAuthModule } from './modules/admin/auth/auth.module';
import { DashboardModule } from './modules/admin/dashboard/dashboard.module';
import { ProductsModule as AdminProductsModule } from './modules/admin/products/products.module';
import { CategoriesModule as AdminCategoriesModule } from './modules/admin/categories/categories.module';
import { OrdersModule as AdminOrdersModule } from './modules/admin/orders/orders.module';
import { CustomersModule as AdminCustomersModule } from './modules/admin/customers/customers.module';
import { BlogsModule as AdminBlogsModule } from './modules/admin/blogs/blogs.module';
import { ReviewsModule as AdminReviewsModule } from './modules/admin/reviews/reviews.module';
import { AnalyticsModule as AdminAnalyticsModule } from './modules/admin/analytics/analytics.module';
import { NotificationsModule as AdminNotificationsModule } from './modules/admin/notifications/notifications.module';
import { SettingsModule as AdminSettingsModule } from './modules/admin/settings/settings.module';
import { ShippingModule as AdminShippingModule } from './modules/admin/shipping/shipping.module';
import { ReportsModule } from './modules/admin/reports/reports.module';
import { UploadModule as AdminUploadModule } from './modules/admin/upload/upload.module';
import { TestimonialsModule as AdminTestimonialsModule } from './modules/admin/testimonials/testimonials.module';
import { VaultModule as AdminVaultModule } from './modules/admin/vault/vault.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    RedisModule,
    ScheduleModule.forRoot(),
    ThrottlerModule.forRootAsync({
      useFactory: (redis: RedisService) => ({
        throttlers: [
          { name: 'default', ttl: minutes(1), limit: 120 },
          { name: 'otp-send-short', ttl: minutes(10), limit: 3 },
          { name: 'otp-send-long', ttl: hours(1), limit: 20 },
          { name: 'otp-verify', ttl: hours(1), limit: 20 },
          { name: 'search', ttl: minutes(1), limit: 30 },
          { name: 'search-suggestions', ttl: minutes(1), limit: 30 },
          { name: 'products', ttl: minutes(1), limit: 60 },
          { name: 'delivery-estimate', ttl: minutes(1), limit: 30 },
          { name: 'cart', ttl: minutes(1), limit: 120 },
          { name: 'guest-cart', ttl: minutes(1), limit: 20 },
          { name: 'wishlist', ttl: minutes(1), limit: 120 },
          { name: 'orders', ttl: minutes(1), limit: 60 },
          { name: 'address-read', ttl: minutes(1), limit: 60 },
          { name: 'address-mutation', ttl: minutes(1), limit: 30 },
          { name: 'checkout', ttl: minutes(1), limit: 20 },
          { name: 'payment-create', ttl: minutes(1), limit: 20 },
          { name: 'payment-verify', ttl: minutes(1), limit: 30 },
          { name: 'reviews-helpful', ttl: minutes(1), limit: 20 },
        ],
        storage: new RedisThrottlerStorage(redis),
      }),
      inject: [RedisService],
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    ProfileModule,
    HomeModule,
    SearchModule,
    ProductsModule,
    CompareModule,
    WishlistModule,
    CartModule,
    CheckoutModule,
    PaymentsModule,
    OrdersModule,
    ReviewsModule,
    NotificationsModule,
    RecommendationModule,
    CategoriesModule,
    AdminAuthModule,
    DashboardModule,
    AdminProductsModule,
    AdminCategoriesModule,
    AdminOrdersModule,
    AdminCustomersModule,
    AdminBlogsModule,
    AdminReviewsModule,
    AdminAnalyticsModule,
    AdminNotificationsModule,
    AdminSettingsModule,
    AdminShippingModule,
    ReportsModule,
    AdminUploadModule,
    AdminTestimonialsModule,
    AdminVaultModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    AuditService,
    OtpCacheService,
    {
      provide: ThrottlerGuard,
      useClass: AppThrottlerGuard,
    },
  ],
  exports: [AuditService, OtpCacheService, ThrottlerGuard],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
