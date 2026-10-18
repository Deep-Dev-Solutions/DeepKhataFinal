import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OnboardingModule } from './onboarding/onboarding.module';
import { LifecycleModule } from './lifecycle/lifecycle.module';
import { OrdersModule } from './orders/orders.module';
import { ProductsModule } from './products/products.module';
import { ReportsModule } from './reports/reports.module';
import { SettingsModule } from './settings/settings.module';
import { TeamModule } from './team/team.module';
import { ThrottlerModule } from '@nestjs/throttler';

import { LedgerModule } from './ledger/ledger.module';
import { SyncModule } from './sync/sync.module';
import { CashModule } from './cash/cash.module';
import { InventoryModule } from './inventory/inventory.module';
import { VendorsModule } from './vendors/vendors.module.js';
import { BusinessModule } from './business/business.module';
import { AgencyModule } from './agency/agency.module';
import { CategoryModule } from './category/category.module';
import { CabinetModule } from './cabinet/cabinet.module';
import { RedisModule } from './redis/redis.module';
import { TenantModule } from './tenant/tenant.module';
import { ScheduleModule } from '@nestjs/schedule';
import { NotificationsModule } from './notifications/notifications.module';
import { KhataEntriesModule } from './khata-entries/khata-entries.module';
import { StockFinderModule } from './stock-finder/stock-finder.module';
import { DuesModule } from './dues/dues.module';
import { ReservationsModule } from './reservations/reservations.module';
import { StockTransfersModule } from './stock-transfers/stock-transfers.module';
import { RemindersModule } from './reminders/reminders.module';
import { MailModule } from './mail/mail.module';
import { PlansModule } from './plans/plans.module';
import { BillingModule } from './billing/billing.module';
import { AnalyticsModule } from './analytics/analytics.module';

@Module({
  imports: [
    TenantModule,
    PlansModule,
    BillingModule,
    AnalyticsModule,
    ScheduleModule.forRoot(),
    MailModule,
    NotificationsModule,
    KhataEntriesModule,
    StockFinderModule,
    DuesModule,
    ReservationsModule,
    StockTransfersModule,
    RemindersModule,
    ThrottlerModule.forRoot([
      {
        ttl: 60000,
        limit: 100,
      },
    ]),
    PrismaModule,
    AuthModule,
    CustomersModule,
    DashboardModule,
    OnboardingModule,
    LifecycleModule,
    OrdersModule,
    ProductsModule,
    ReportsModule,
    SettingsModule,
    TeamModule,
    LedgerModule,
    SyncModule,
    CashModule,
    InventoryModule,
    VendorsModule,
    BusinessModule,
    AgencyModule,
    CategoryModule,
    CabinetModule,
    RedisModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
