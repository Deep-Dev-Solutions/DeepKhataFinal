import {
  Injectable,
  BadRequestException,
  ConflictException,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaService } from '../prisma/prisma.service';
import { TenantCacheService } from '../tenant/tenant-cache.service';
import { AuthSessionsService } from '../auth/auth-sessions.service';
import { SubscriptionsService } from '../plans/subscriptions.service';
import { MailService } from '../mail/mail.service';
import { OnboardingDto } from './dto/onboarding.dto';
import { claimTrial, requireNormalizedPhone } from '../common/trial-claim';

export const DEMO_PREFIX = 'Demo: ';
const DAY_MS = 86_400_000;

export type ChecklistKey =
  | 'first_product'
  | 'first_sale'
  | 'udhar_customer'
  | 'staff_user'
  | 'notification_prefs';

const CHECKLIST_KEYS: ChecklistKey[] = [
  'first_product',
  'first_sale',
  'udhar_customer',
  'staff_user',
  'notification_prefs',
];

interface ChecklistState {
  dismissed?: boolean;
  sampleIds?: { products: string[]; customers: string[] };
}

// Ten starter products: name, base price (PKR), unit cost, instances in stock.
const DEMO_PRODUCTS: { name: string; price: string; cost: string; qty: number }[] = [
  { name: 'Basmati Rice 5kg', price: '1450.00', cost: '1300.00', qty: 3 },
  { name: 'Cooking Oil 1L', price: '620.00', cost: '560.00', qty: 3 },
  { name: 'Sugar 1kg', price: '160.00', cost: '145.00', qty: 3 },
  { name: 'Tea Leaves 190g', price: '320.00', cost: '285.00', qty: 2 },
  { name: 'Milk Pack 1L', price: '280.00', cost: '255.00', qty: 2 },
  { name: 'Soap Bar', price: '110.00', cost: '90.00', qty: 3 },
  { name: 'Detergent 1kg', price: '450.00', cost: '390.00', qty: 2 },
  { name: 'Biscuits Family Pack', price: '95.00', cost: '78.00', qty: 1 },
  { name: 'Mineral Water 1.5L', price: '90.00', cost: '70.00', qty: 3 },
  { name: 'Phone Charger', price: '850.00', cost: '600.00', qty: 1 },
];

export function normalizePkPhone(raw: string): { local: string; international: string } {
  const digits = raw.replace(/[^\d]/g, '');
  let national = digits;
  if (digits.startsWith('92')) national = digits.slice(2);
  else if (digits.startsWith('0')) national = digits.slice(1);
  return { local: `0${national}`, international: `92${national}` };
}

/** Display ("0300...") and WhatsApp ("92300...") forms of a normalised number. */
function phoneForms(e164: string): { local: string; international: string } {
  const international = e164.slice(1);
  return {
    local: e164.startsWith('+92') ? `0${e164.slice(3)}` : e164,
    international,
  };
}

function slugify(name: string): string {
  const base = name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '')
    .slice(0, 40);
  return base || 'shop';
}

@Injectable()
export class OnboardingService {
  private readonly logger = new Logger(OnboardingService.name);

  constructor(
    private prisma: PrismaService,
    private authSessions: AuthSessionsService,
    private tenantCache: TenantCacheService,
    private subscriptions: SubscriptionsService,
    private mail: MailService,
  ) {}

  async businessOnboarding(ownerId: string, data: OnboardingDto) {
    if (!ownerId) {
      throw new UnauthorizedException('Authentication required');
    }

    const owner = await this.prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true, name: true, email: true, businessId: true },
    });
    if (!owner) {
      throw new UnauthorizedException('Authentication required');
    }
    if (owner.businessId) {
      throw new ConflictException('User already belongs to a business');
    }

    const e164 = requireNormalizedPhone(data.phone);
    const phone = phoneForms(e164);
    const now = new Date();
    const wantsSample = data.loadSampleData === true;

    const result = await this.prisma.$transaction(
      async (tx) => {
        if (data.slug) {
          const taken = await tx.business.findUnique({
            where: { slug: data.slug },
            select: { id: true },
          });
          if (taken) throw new BadRequestException('Business Slug Already Exists');
        }
        const slug = data.slug ?? (await this.uniqueSlug(tx, data.shopName));
        const business = await tx.business.create({
          data: {
            name: data.shopName.trim(),
            industry: data.industry,
            teamSize: data.teamSize,
            ...(data.currency ? { currency: data.currency } : {}),
            slug,
            phone: phone.local,
            address: data.address,
            city: data.city.trim(),
            market: data.market?.trim() || null,
            source: data.source?.trim() || 'self_signup',
            termsAcceptedAt: now,
            ownerId,
          },
        });

        // One trial per phone: a duplicate throws 409 and rolls everything back.
        await claimTrial(tx, {
          phoneNormalized: e164,
          businessId: business.id,
          userId: ownerId,
        });

        await tx.user.update({
          where: { id: ownerId },
          data: { role: 'OWNER', businessId: business.id },
        });

        // Auto-provision the main branch
        const branch = await tx.branch.create({
          data: {
            name: data.branchName.trim(),
            businessId: business.id,
            phone: phone.local,
            location: data.address || null,
          },
        });

        const sub = await this.subscriptions.startTrial(business.id, tx, now);

        const checklist: ChecklistState = {};
        if (wantsSample) {
          checklist.sampleIds = await this.createSamplePack(
            tx,
            business.id,
            branch.id,
            ownerId,
          );
        }
        const updated = await tx.business.update({
          where: { id: business.id },
          data: {
            sampleDataLoaded: wantsSample,
            onboardingChecklist: checklist as Prisma.InputJsonValue,
          },
        });

        await tx.agencyTask.create({
          data: {
            businessId: business.id,
            type: 'FEEDBACK_CALL',
            dueAt: new Date(now.getTime() + 3 * DAY_MS),
            notes: `New signup ${data.shopName} (${phone.local}). Call for feedback.`,
          },
        });
        await tx.lifecycleMessage.create({
          data: { businessId: business.id, key: 'trial-day0' },
        });

        return { business: updated, trialEndsAt: sub.trialEndsAt };
      },
      { maxWait: 10000, timeout: 20000 },
    );

    // The user now has a business and OWNER role; drop the cached pre-onboarding row.
    this.tenantCache.invalidateUser(ownerId);

    await this.notifyAfterSignup(owner, result.business, phone.international);

    const { token: accessToken } = await this.authSessions.createSessionFor(
      ownerId,
    );

    return {
      message: 'Business Onboarding Successful',
      business: result.business,
      accessToken,
      trialEndsAt: result.trialEndsAt,
    };
  }

  /** Mail never blocks signup: failures are logged and retried by MailService. */
  private async notifyAfterSignup(
    owner: { name: string; email: string },
    business: { id: string; name: string; city: string | null; market: string | null },
    waNumber: string,
  ): Promise<void> {
    const frontend = process.env.FRONTEND_URL ?? 'http://localhost:3000';
    try {
      await this.mail.send(
        'welcome',
        owner.email,
        {
          name: owner.name,
          businessName: business.name,
          links: [
            { label: 'Open your dashboard', url: `${frontend}/dashboard` },
            { label: 'Add your first product', url: `${frontend}/inventory` },
          ],
        },
        { businessId: business.id },
      );
    } catch (e) {
      this.logger.warn(`Welcome email failed: ${(e as Error).message}`);
    }

    const alertTo = process.env.AGENCY_ALERT_EMAIL?.trim();
    if (!alertTo) return;
    try {
      await this.mail.send(
        'agency-signup-alert',
        alertTo,
        {
          shopName: business.name,
          ownerName: owner.name,
          phone: waNumber.startsWith('92') ? `0${waNumber.slice(2)}` : `+${waNumber}`,
          city: business.city ?? '',
          market: business.market ?? '',
          waLink: `https://wa.me/${waNumber}`,
        },
        { businessId: business.id },
      );
    } catch (e) {
      this.logger.warn(`Agency alert email failed: ${(e as Error).message}`);
    }
  }

  private async uniqueSlug(tx: Prisma.TransactionClient, shopName: string) {
    const base = slugify(shopName);
    for (let i = 0; i < 5; i++) {
      const slug = `${base}-${randomBytes(3).toString('hex')}`;
      const taken = await tx.business.findUnique({
        where: { slug },
        select: { id: true },
      });
      if (!taken) return slug;
    }
    throw new BadRequestException('Could not generate a unique shop address');
  }

  private async createSamplePack(
    tx: Prisma.TransactionClient,
    businessId: string,
    branchId: string,
    userId: string,
  ): Promise<{ products: string[]; customers: string[] }> {
    const products = DEMO_PRODUCTS.map((p, i) => ({
      ...p,
      id: randomUUID(),
      sku: `DEMO-${String(i + 1).padStart(3, '0')}`,
    }));
    await tx.product.createMany({
      data: products.map((p) => ({
        id: p.id,
        name: `${DEMO_PREFIX}${p.name}`,
        sku: p.sku,
        basePrice: p.price,
        defaultCostPrice: p.cost,
        businessId,
        branchId,
      })),
    });
    await tx.productInstance.createMany({
      data: products.flatMap((p) =>
        Array.from({ length: p.qty }, (_, n) => ({
          productId: p.id,
          branchId,
          unitCost: p.cost,
          status: 'AVAILABLE' as const,
          serialNumber: `${p.sku}-${n + 1}`,
        })),
      ),
    });
    await tx.inventoryMovement.createMany({
      data: products.map((p) => ({
        productId: p.id,
        quantity: p.qty,
        direction: 'IN' as const,
        referenceType: 'INITIAL_STOCK',
        referenceId: p.id,
        notes: 'Sample data',
        userId,
        businessId,
        branchId,
      })),
    });

    const customers = [1, 2].map((n) => ({
      id: randomUUID(),
      name: `Demo Customer ${n}`,
      phone: `0300000000${n}`,
    }));
    await tx.customer.createMany({
      data: customers.map((c) => ({ ...c, businessId })),
    });

    return {
      products: products.map((p) => p.id),
      customers: customers.map((c) => c.id),
    };
  }

  private async loadState(businessId: string) {
    const business = await this.prisma.business.findUnique({
      where: { id: businessId },
      select: { onboardingChecklist: true, sampleDataLoaded: true, ownerId: true },
    });
    if (!business) throw new UnauthorizedException('Authentication required');
    const state = (business.onboardingChecklist ?? {}) as ChecklistState;
    return { business, state };
  }

  /** Removes only the sample pack rows; real data is never touched. */
  async wipeSampleData(businessId: string) {
    const { business, state } = await this.loadState(businessId);
    if (!business.sampleDataLoaded) {
      throw new BadRequestException('No sample data is loaded');
    }

    // Prefer the tracked ids; fall back to the "Demo: " prefix for packs without ids.
    let productIds = state.sampleIds?.products;
    let customerIds = state.sampleIds?.customers;
    if (!productIds) {
      productIds = (
        await this.prisma.product.findMany({
          where: { businessId, name: { startsWith: DEMO_PREFIX }, deletedAt: null },
          select: { id: true },
        })
      ).map((p) => p.id);
    }
    if (!customerIds) {
      customerIds = (
        await this.prisma.customer.findMany({
          where: {
            businessId,
            name: { startsWith: 'Demo Customer ' },
            deletedAt: null,
          },
          select: { id: true },
        })
      ).map((c) => c.id);
    }

    const [itemSales, customerOrders, customerKhata, reservations] =
      await Promise.all([
        this.prisma.orderItem.count({
          where: { productId: { in: productIds }, order: { businessId } },
        }),
        this.prisma.order.count({
          where: { businessId, customerId: { in: customerIds } },
        }),
        this.prisma.khataEntry.count({
          where: { businessId, customerId: { in: customerIds }, deletedAt: null },
        }),
        this.prisma.stockReservation
          .count({
            where: { businessId, instance: { productId: { in: productIds } } },
          })
          .then(
            async (n) =>
              n +
              (await this.prisma.stockTransferItem.count({
                where: { instance: { productId: { in: productIds } } },
              })),
          ),
      ]);
    if (itemSales > 0 || customerOrders > 0 || customerKhata > 0 || reservations > 0) {
      throw new ConflictException(
        'Sample data has already been used in sales, khata or reservations, so it cannot be removed',
      );
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.inventoryMovement.deleteMany({
        where: { businessId, productId: { in: productIds } },
      });
      await tx.productInstance.deleteMany({
        where: { productId: { in: productIds }, product: { businessId } },
      });
      // Soft delete so offline clients receive tombstones on the next sync.
      await tx.product.updateMany({
        where: { id: { in: productIds }, businessId },
        data: { deletedAt: now },
      });
      await tx.customer.updateMany({
        where: { id: { in: customerIds }, businessId },
        data: { deletedAt: now },
      });
      const next: ChecklistState = { ...state };
      delete next.sampleIds;
      await tx.business.update({
        where: { id: businessId },
        data: {
          sampleDataLoaded: false,
          onboardingChecklist: next as Prisma.InputJsonValue,
        },
      });
    });

    return {
      message: 'Sample data removed',
      removed: { products: productIds.length, customers: customerIds.length },
    };
  }

  async getChecklist(businessId: string) {
    const { business, state } = await this.loadState(businessId);
    const demoProducts = business.sampleDataLoaded ? (state.sampleIds?.products ?? []) : [];
    const demoCustomers = business.sampleDataLoaded ? (state.sampleIds?.customers ?? []) : [];

    const [products, sales, khata, creditOrders, staff, prefs] = await Promise.all([
      this.prisma.product.count({
        where: { businessId, deletedAt: null, id: { notIn: demoProducts } },
      }),
      this.prisma.order.count({
        where: { businessId, status: { notIn: ['CANCELLED', 'ESTIMATE'] } },
      }),
      this.prisma.khataEntry.count({
        where: {
          businessId,
          direction: 'RECEIVABLE',
          deletedAt: null,
          OR: [{ customerId: null }, { customerId: { notIn: demoCustomers } }],
        },
      }),
      this.prisma.order.count({
        where: {
          businessId,
          paymentStatus: { not: 'PAID' },
          status: { notIn: ['CANCELLED', 'ESTIMATE'] },
          customerId: { not: null, notIn: demoCustomers },
        },
      }),
      this.prisma.user.count({
        where: { businessId, id: { not: business.ownerId } },
      }),
      this.prisma.notificationSetting.count({ where: { businessId } }),
    ]);

    const done: Record<ChecklistKey, boolean> = {
      first_product: products > 0,
      first_sale: sales > 0,
      udhar_customer: khata > 0 || creditOrders > 0,
      staff_user: staff > 0,
      notification_prefs: prefs > 0,
    };
    const items = CHECKLIST_KEYS.map((key) => ({ key, done: done[key] }));
    return {
      items,
      completed: items.filter((i) => i.done).length,
      total: items.length,
      dismissed: state.dismissed === true,
      sampleDataLoaded: business.sampleDataLoaded,
    };
  }

  async dismissChecklist(businessId: string) {
    const { state } = await this.loadState(businessId);
    const next: ChecklistState = { ...state, dismissed: true };
    await this.prisma.business.update({
      where: { id: businessId },
      data: { onboardingChecklist: next as Prisma.InputJsonValue },
    });
    return { dismissed: true };
  }
}
