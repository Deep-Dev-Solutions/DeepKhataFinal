import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { CustomersModule } from './customers/customers.module';
import { DashboardModule } from './dashboard/dashboard.module';
import { OnboardingModule } from './onboarding/onboarding.module';
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

@Module({
  imports: [
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
  ],
  controllers: [AppController],
  providers: [AppService],
})
export class AppModule {}
