import { MiddlewareConsumer, Module, NestModule } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { PrismaModule } from './prisma/prisma.module';
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
import { RequestIdMiddleware } from './common/middleware/request-id.middleware';
import { AuditService } from './common/services/audit.service';
import { CategoriesModule } from './modules/categories/categories.module';
import { AuthModule as AdminAuthModule } from './modules/admin/auth/auth.module';
import { DashboardModule } from './modules/admin/dashboard/dashboard.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    ScheduleModule.forRoot(),
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
    CategoriesModule,
    AdminAuthModule,
    DashboardModule,
  ],
  controllers: [AppController],
  providers: [AppService, AuditService],
  exports: [AuditService],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(RequestIdMiddleware).forRoutes('*');
  }
}
