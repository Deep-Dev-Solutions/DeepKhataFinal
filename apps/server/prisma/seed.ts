import { PrismaClient } from '@prisma/client';
import {
  ItemCondition,
  OrderStatus,
  PaymentStatus,
  PaymentMethod,
  Prisma,
} from '@prisma/client';
import { createHash } from 'crypto';
import { hash } from 'bcrypt';
import { users, tenants, TEST_PASSWORD } from '../../e2e/fixtures/users';

const prisma = new PrismaClient();

function detId(...parts: string[]): string {
  const data = parts.join(':');
  const hash_val = createHash('sha1').update(data).digest('hex');
  return `${hash_val.substring(0, 8)}-${hash_val.substring(
    8,
    12,
  )}-4${hash_val.substring(13, 16)}-8${hash_val.substring(17, 20)}-${hash_val.substring(
    20,
    32,
  )}`;
}

function mulberry32(seed: number) {
  return function () {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface ProductData {
  id: string;
  name: string;
  sku: string;
  basePrice: number;
  categoryId: string;
}

interface CustomerData {
  id: string;
  name: string;
  phone: string;
}

interface OrderItemInput {
  productId: string;
  quantity: number;
  price: number;
}

const CATEGORIES_A = [
  'Screens',
  'Keyboards',
  'Batteries',
  'Chargers',
  'Motherboards',
  'RAM/SSD',
];

const PRODUCTS_A = [
  { name: 'Dell Latitude E7470 14" FHD Screen', basePrice: 8500 },
  { name: 'Lenovo ThinkPad X1 Carbon Display Panel', basePrice: 12000 },
  { name: 'HP ProBook 450 G6 15.6" Screen', basePrice: 7500 },
  { name: 'ASUS VivoBook 14 LCD Panel', basePrice: 6800 },
  { name: 'Dell XPS 13 1080p Screen Module', basePrice: 15000 },
  { name: 'Cherry MX Mechanical Keyboard - Black', basePrice: 4500 },
  { name: 'Logitech MX Keys Pro Keyboard', basePrice: 8900 },
  { name: 'Corsair K70 RGB Pro Keyboard', basePrice: 9500 },
  { name: 'Razer DeathStalker V2 Wireless Keyboard', basePrice: 10500 },
  { name: 'SteelSeries Apex Pro TKL Keyboard', basePrice: 7800 },
  { name: 'Dell Latitude 7000 Series Battery', basePrice: 3200 },
  { name: 'HP ProBook Battery Pack 3-Cell', basePrice: 2800 },
  { name: 'Lenovo ThinkPad Battery 6 Cell', basePrice: 3500 },
  { name: 'ASUS VivoBook Lithium Ion Battery', basePrice: 2600 },
  { name: 'Acer Aspire Battery Module', basePrice: 2400 },
  { name: 'Dell 65W USB-C Power Adapter', basePrice: 2200 },
  { name: 'Lenovo 65W ThinkPad Charger', basePrice: 2100 },
  { name: 'HP 45W USB-C Fast Charger', basePrice: 1900 },
  { name: 'ASUS 45W VivoBook Charger', basePrice: 1800 },
  { name: 'Universal 30W Dual Port USB-C Charger', basePrice: 1200 },
  { name: 'Dell Latitude Main Logic Board', basePrice: 18000 },
  { name: 'HP ProBook Motherboard Replacement', basePrice: 16500 },
  { name: 'Lenovo ThinkPad X1 System Board', basePrice: 19000 },
  { name: 'ASUS VivoBook Mainboard', basePrice: 14000 },
  { name: 'Acer Aspire Core i7 Motherboard', basePrice: 13500 },
  { name: 'Kingston DDR4 16GB RAM Module', basePrice: 6000 },
  { name: 'Samsung 970 EVO 512GB NVMe SSD', basePrice: 5500 },
  { name: 'Crucial MX500 1TB SATA SSD', basePrice: 7500 },
  { name: 'WD Blue 500GB 2.5" SSD', basePrice: 4200 },
  { name: 'Intel Optane 64GB Cache Module', basePrice: 4800 },
  { name: 'Corsair Vengeance 8GB DDR4 RAM', basePrice: 3500 },
  { name: 'G.Skill Ripjaws 32GB DDR4 Kit', basePrice: 8500 },
  { name: 'Seagate Barracuda 2TB HDD', basePrice: 5800 },
  { name: 'Western Digital Blue 4TB HDD', basePrice: 7200 },
  { name: 'Samsung 870 QVO 2TB SSD', basePrice: 8800 },
  { name: 'ADATA XPG SX8200 1TB NVMe', basePrice: 6200 },
  { name: 'Micron Crucial P1 500GB NVMe', basePrice: 4000 },
  { name: 'Kingston A2000 1TB NVMe SSD', basePrice: 6800 },
  { name: 'SK Hynix Platinum P41 512GB', basePrice: 5500 },
  { name: 'Transcend MTS830S 256GB SSD', basePrice: 3200 },
  { name: 'Intel 760p 256GB NVMe', basePrice: 3800 },
  { name: 'Dell PowerEdge RAID Controller', basePrice: 9500 },
  { name: 'HP Smart Array Controller Card', basePrice: 8200 },
  { name: 'LSI MegaRAID SAS 9361-8i Controller', basePrice: 12000 },
  { name: 'Adaptec MaxCache Ultra RAID Card', basePrice: 7500 },
  { name: 'Kingston Hyper-X FURY RAM 16GB', basePrice: 5500 },
  { name: 'Patriot Viper Steel 32GB DDR4', basePrice: 9000 },
  { name: 'TEAMGROUP T-Force Delta RGB 8GB', basePrice: 3800 },
  { name: 'Gigabyte Aorus DDR4 16GB RGB', basePrice: 7000 },
  { name: 'MSI Arsenal Gaming DDR4 16GB', basePrice: 6800 },
  { name: 'ASRock Phantom Gaming DDR4 8GB', basePrice: 3600 },
  { name: 'Crucial Ballistix RGB 16GB DDR4', basePrice: 6200 },
  { name: 'NZXT High Performance DDR4 32GB', basePrice: 10000 },
  { name: 'Sabrent Rocket 4 Plus 2TB NVMe', basePrice: 9500 },
  { name: 'XPG Gammix S70 Blade 1TB NVMe', basePrice: 7200 },
  { name: 'Mushkin Enhanced Pilot-E 512GB', basePrice: 3800 },
  { name: 'Intel 670p 1TB QLC NVMe', basePrice: 5800 },
  { name: 'SK Hynix Platinum P42 256GB', basePrice: 2800 },
  { name: 'Kioxia XG6 1TB NVMe SSD', basePrice: 6500 },
  { name: 'HP EliteBook 840 G5 Keyboard (Backlit)', basePrice: 4200 },
];

const CONDITIONS: ItemCondition[] = [
  'ORIGINAL_PULL',
  'COPY',
  'MINOR_SCRATCHES',
  'WORKING',
  'DEAD_DONOR',
  'DEFECTIVE',
];

const VENDORS_A = [
  { name: 'TechWorld Distributors', contact: 'Ali Khan' },
  { name: 'Electronics Plus', contact: 'Mehwish Abbas' },
  { name: 'PC Components Ltd', contact: 'Rizwan Sheikh' },
  { name: 'Digital Supply Co', contact: 'Zara Hassan' },
  { name: 'Hardware Hub Pakistan', contact: 'Imran Malik' },
  { name: 'Smart Devices Wholesale', contact: 'Nadia Yousaf' },
];

const CUSTOMER_NAMES_A = [
  'Muhammad Hassan',
  'Ayesha Ahmed',
  'Ahmed Khan',
  'Fatima Ali',
  'Hassan Raza',
  'Amina Khan',
  'Ali Mirza',
  'Zara Malik',
  'Rizwan Hussain',
  'Nadia Khan',
  'Imran Hassan',
  'Saira Ahmed',
  'Usman Ali',
  'Hina Khan',
  'Tariq Malik',
  'Bushra Ahmed',
  'Karim Khan',
  'Leila Hassan',
  'Samir Ali',
  'Rania Khan',
];

const CUSTOMER_NAMES_B = [
  'Muhammad Shahzaib',
  'Faisal Ahmed',
  'Haroon Khan',
  'Naira Ali',
  'Bilal Hassan',
];

async function seedTenant(
  tenantKey: 'A' | 'B',
  ownerUser: { id: string },
  managerUser: { id: string } | null,
  staffUsers: { id: string }[],
) {
  const tenantData = tenants[tenantKey];

  console.log(`Seeding tenant ${tenantKey}: ${tenantData.name}`);

  const business = await prisma.business.upsert({
    where: { slug: tenantData.slug },
    update: {},
    create: {
      id: tenantData.id,
      name: tenantData.name,
      slug: tenantData.slug,
      ownerId: ownerUser.id,
      email: `contact@${tenantData.slug}.test`,
      currency: 'PKR',
    },
  });

  await prisma.user.update({
    where: { id: ownerUser.id },
    data: { businessId: business.id },
  });

  for (const member of managerUser
    ? [managerUser, ...staffUsers]
    : staffUsers) {
    await prisma.user.update({
      where: { id: member.id },
      data: { businessId: business.id },
    });
  }

  const branchIds: Record<string, string> = {};
  for (const [branchKey, branchData] of Object.entries(tenantData.branches)) {
    const branch = await prisma.branch.upsert({
      where: { id: branchData.id },
      update: {},
      create: {
        id: branchData.id,
        name: branchData.name,
        businessId: business.id,
      },
    });
    branchIds[branchKey] = branch.id;
  }

  const numCabinets = tenantKey === 'A' ? 3 : 2;
  const cabinetsByBranch: Record<string, string[]> = {};
  for (const branchKey of Object.keys(tenantData.branches)) {
    const branchId = branchIds[branchKey];
    cabinetsByBranch[branchId] = [];
    for (let i = 0; i < numCabinets; i++) {
      const cabinetId = detId(`cabinet-${tenantKey}-${branchKey}-${i}`);
      const shelf = `S${(i % 3) + 1}`;
      const bin = `B${(i % 4) + 1}`;
      await prisma.cabinet.upsert({
        where: { id: cabinetId },
        update: {},
        create: {
          id: cabinetId,
          name: `Cabinet ${i + 1}`,
          rack: `R${i + 1}`,
          shelf,
          bin,
          businessId: business.id,
          branchId,
        },
      });
      cabinetsByBranch[branchId].push(cabinetId);
    }
  }

  const categoryMap: Record<string, string> = {};
  const categoriesToSeed =
    tenantKey === 'A' ? CATEGORIES_A : CATEGORIES_A.slice(0, 3);
  for (const catName of categoriesToSeed) {
    const category = await prisma.category.upsert({
      where: {
        name_businessId: { name: catName, businessId: business.id },
      },
      update: {},
      create: {
        id: detId(`category-${tenantKey}-${catName}`),
        name: catName,
        businessId: business.id,
      },
    });
    categoryMap[catName] = category.id;
  }

  const products: ProductData[] = [];
  const productsToSeed =
    tenantKey === 'A' ? PRODUCTS_A : PRODUCTS_A.slice(0, 20);
  let productIndex = 0;
  for (const prod of productsToSeed) {
    const categoryName =
      categoriesToSeed[productIndex % categoriesToSeed.length];
    const productId = detId(`product-${tenantKey}-${productIndex}`);
    const sku = `${tenantKey}-SKU-${String(productIndex).padStart(4, '0')}`;
    const product = await prisma.product.upsert({
      where: { id: productId },
      update: {},
      create: {
        id: productId,
        name: prod.name,
        sku,
        basePrice: prod.basePrice,
        defaultCostPrice: prod.basePrice * 0.6,
        businessId: business.id,
        categoryId: categoryMap[categoryName],
      },
    });
    products.push({
      id: product.id,
      name: product.name,
      sku: product.sku,
      basePrice: product.basePrice,
      categoryId: categoryMap[categoryName],
    });
    productIndex++;
  }

  const seededRng = mulberry32(12345);
  const branchList = Object.entries(branchIds);
  const hallRoadId =
    branchIds['hallRoad'] || branchIds[Object.keys(branchIds)[0]];
  const hafeezCentreId =
    branchIds['hafeezCentre'] || branchIds[Object.keys(branchIds)[0]];

  const thirdSize = Math.floor(products.length / 3);
  const productsOnlyHallRoad = products.slice(0, thirdSize);
  const productsOnlyHafeez = products.slice(thirdSize, 2 * thirdSize);
  const productsMultiBranch = products.slice(2 * thirdSize);

  for (const product of productsOnlyHallRoad) {
    for (let i = 0; i < 3; i++) {
      const instanceId = detId(`instance-${product.id}-hallroad-${i}`);
      const cabinets = cabinetsByBranch[hallRoadId];
      const cabinet = cabinets[Math.floor(seededRng() * cabinets.length)];
      await prisma.productInstance.upsert({
        where: { id: instanceId },
        update: {},
        create: {
          id: instanceId,
          productId: product.id,
          branchId: hallRoadId,
          cabinetId: cabinet,
          condition: CONDITIONS[Math.floor(seededRng() * CONDITIONS.length)],
          status: 'AVAILABLE',
        },
      });
    }
  }

  for (const product of productsOnlyHafeez) {
    for (let i = 0; i < 3; i++) {
      const instanceId = detId(`instance-${product.id}-hafeezcentre-${i}`);
      const cabinets = cabinetsByBranch[hafeezCentreId];
      const cabinet = cabinets[Math.floor(seededRng() * cabinets.length)];
      await prisma.productInstance.upsert({
        where: { id: instanceId },
        update: {},
        create: {
          id: instanceId,
          productId: product.id,
          branchId: hafeezCentreId,
          cabinetId: cabinet,
          condition: CONDITIONS[Math.floor(seededRng() * CONDITIONS.length)],
          status: 'AVAILABLE',
        },
      });
    }
  }

  for (const product of productsMultiBranch) {
    for (const [, branchId] of branchList) {
      for (let i = 0; i < 2; i++) {
        const instanceId = detId(`instance-${product.id}-${branchId}-${i}`);
        const cabinets = cabinetsByBranch[branchId];
        const cabinet = cabinets[Math.floor(seededRng() * cabinets.length)];
        await prisma.productInstance.upsert({
          where: { id: instanceId },
          update: {},
          create: {
            id: instanceId,
            productId: product.id,
            branchId,
            cabinetId: cabinet,
            condition: CONDITIONS[Math.floor(seededRng() * CONDITIONS.length)],
            status: 'AVAILABLE',
          },
        });
      }
    }
  }

  // Which products have stock in which branch, so orders only sell what the
  // branch actually holds.
  const productsByBranch: Record<string, ProductData[]> = {};
  for (const [, branchId] of branchList) {
    productsByBranch[branchId] = [...productsMultiBranch];
  }
  // Tenant B has one branch, so both ids point at it.
  productsByBranch[hallRoadId].push(...productsOnlyHallRoad);
  productsByBranch[hafeezCentreId].push(...productsOnlyHafeez);

  /** Picks `count` distinct products from the branch's stocked list. */
  const pickDistinctProducts = (
    branchId: string,
    count: number,
  ): ProductData[] => {
    const pool = productsByBranch[branchId];
    const start = Math.floor(seededRng() * pool.length);
    const picked: ProductData[] = [];
    for (let k = 0; k < Math.min(count, pool.length); k++) {
      picked.push(pool[(start + k * 7) % pool.length]);
    }
    return [...new Map(picked.map((p) => [p.id, p])).values()];
  };

  const vendors = [];
  const vendorsToSeed = tenantKey === 'A' ? VENDORS_A : VENDORS_A.slice(0, 3);
  for (let i = 0; i < vendorsToSeed.length; i++) {
    const vendor = await prisma.vendor.upsert({
      where: { id: detId(`vendor-${tenantKey}-${i}`) },
      update: {},
      create: {
        id: detId(`vendor-${tenantKey}-${i}`),
        businessName: vendorsToSeed[i].name,
        contactName: vendorsToSeed[i].contact,
        phone: `+92300${String(i).padStart(7, '0')}`,
        businessId: business.id,
      },
    });
    vendors.push(vendor);
  }

  const customerNames = tenantKey === 'A' ? CUSTOMER_NAMES_A : CUSTOMER_NAMES_B;
  const customers: CustomerData[] = [];

  const walkInId = detId(`customer-walkin-${tenantKey}`);
  const walkIn = await prisma.customer.upsert({
    where: { id: walkInId },
    update: {},
    create: {
      id: walkInId,
      name: 'Walk-In Customer',
      phone: '00000000000',
      businessId: business.id,
    },
  });
  customers.push(walkIn);

  for (let i = 0; i < customerNames.length; i++) {
    const customerId = detId(`customer-${tenantKey}-${i}`);
    const customer = await prisma.customer.upsert({
      where: { id: customerId },
      update: {},
      create: {
        id: customerId,
        name: customerNames[i],
        phone: `+92${300 + (i % 3)}${String(i).padStart(7, '0')}`,
        shopName: i % 3 === 0 ? `${customerNames[i]}'s Shop` : null,
        businessId: business.id,
        creditLimit: 50000,
      },
    });
    customers.push(customer);
  }

  const anchorDate = new Date('2026-01-01T09:00:00+05:00');

  if (tenantKey === 'A') {
    for (let orderIdx = 0; orderIdx < 30; orderIdx++) {
      const orderId = detId(`order-${tenantKey}-${orderIdx}`);

      const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
      });
      if (existingOrder) {
        continue;
      }

      let orderStatus: OrderStatus = 'FINAL';
      let paymentStatus: PaymentStatus = 'PAID';
      let customerForOrder = customers[
        Math.floor(seededRng() * customers.length)
      ] as CustomerData;
      let amountPaid = 0;

      if (orderIdx < 20) {
        orderStatus = 'FINAL';
        paymentStatus = 'PAID';
        customerForOrder = customers[
          1 + (orderIdx % (customers.length - 1))
        ] as CustomerData;
        amountPaid = 0;
      } else if (orderIdx < 25) {
        orderStatus = 'FINAL';
        paymentStatus = 'UNPAID';
        customerForOrder = customers[
          1 + ((orderIdx - 20) % (customers.length - 1))
        ] as CustomerData;
        amountPaid = 0;
      } else if (orderIdx < 28) {
        orderStatus = 'FINAL';
        paymentStatus = 'PARTIAL';
        // Customers 6-8, so udhar spans 8 distinct customers (1-5 unpaid).
        customerForOrder = customers[6 + (orderIdx - 25)] as CustomerData;
        amountPaid = 0;
      } else if (orderIdx === 28) {
        orderStatus = 'ESTIMATE';
        paymentStatus = 'UNPAID';
        customerForOrder = walkIn;
        amountPaid = 0;
      } else {
        orderStatus = 'MEMO';
        paymentStatus = 'UNPAID';
        customerForOrder = walkIn;
        amountPaid = 0;
      }

      const daysAgo = Math.floor(seededRng() * 60);
      const orderDate = new Date(anchorDate);
      orderDate.setDate(orderDate.getDate() - daysAgo);

      const selectedBranch =
        branchList[Math.floor(seededRng() * branchList.length)];
      const branchId = selectedBranch[1];

      const numItems = Math.floor(seededRng() * 4) + 1;
      const items: OrderItemInput[] = [];
      let totalAmount = 0;

      for (const product of pickDistinctProducts(branchId, numItems)) {
        const qty = Math.floor(seededRng() * 2) + 1;
        const price = product.basePrice;
        items.push({ productId: product.id, quantity: qty, price });
        totalAmount += qty * price;
      }

      const discount = Math.floor(seededRng() * (totalAmount * 0.1));
      const netAmount = totalAmount - discount;

      if (orderStatus === 'FINAL' && amountPaid === 0) {
        amountPaid = paymentStatus === 'PAID' ? netAmount : 0;
        if (paymentStatus === 'PARTIAL') {
          amountPaid = Math.floor(netAmount * 0.4);
        }
      }

      await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            id: orderId,
            businessId: business.id,
            branchId,
            customerId: customerForOrder.id,
            totalAmount: netAmount,
            discount,
            paymentStatus,
            status: orderStatus,
            createdBy: ownerUser.id,
            createdAt: orderDate,
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
              })),
            },
          },
          include: { items: true },
        });

        if (orderStatus !== 'ESTIMATE') {
          for (const item of items) {
            const instancesForOrder = await tx.productInstance.findMany({
              where: {
                productId: item.productId,
                branchId,
                status: 'AVAILABLE',
              },
              take: item.quantity,
            });

            if (instancesForOrder.length > 0) {
              const newStatus = orderStatus === 'MEMO' ? 'MEMO_LOCKED' : 'SOLD';
              await tx.productInstance.updateMany({
                where: {
                  id: { in: instancesForOrder.map((i) => i.id) },
                },
                data: { status: newStatus },
              });

              const inventoryMovementId = detId(
                `inventory-movement-${orderId}-${item.productId}`,
              );
              await tx.inventoryMovement.create({
                data: {
                  id: inventoryMovementId,
                  productId: item.productId,
                  cabinetId: instancesForOrder[0]?.cabinetId || null,
                  toCondition:
                    instancesForOrder[0]?.condition || 'ORIGINAL_PULL',
                  quantity: item.quantity,
                  direction: 'OUT',
                  referenceType: orderStatus === 'MEMO' ? 'MEMO' : 'ORDER',
                  referenceId: order.id,
                  userId: ownerUser.id,
                  businessId: business.id,
                  createdAt: orderDate,
                },
              });
            }
          }

          if (amountPaid > 0) {
            const paymentId = detId(`payment-${orderId}`);
            await tx.payment.create({
              data: {
                id: paymentId,
                orderId: order.id,
                amount: amountPaid,
                method: 'CASH' as PaymentMethod,
                receivedBy: ownerUser.id,
                createdAt: orderDate,
              },
            });
          }
        }

        if (orderStatus === 'FINAL') {
          const postings: Array<{
            accountId: string;
            accountType: string;
            amount: number;
          }> = [];
          if (netAmount > 0) {
            postings.push({
              accountId: 'REVENUE',
              accountType: 'REVENUE',
              amount: -netAmount,
            });
          }

          const cashPortion = Math.min(amountPaid, netAmount);
          const arPortion = netAmount - cashPortion;

          if (cashPortion > 0) {
            postings.push({
              accountId: 'CASH',
              accountType: 'ASSET',
              amount: cashPortion,
            });
          }

          if (arPortion > 0) {
            postings.push({
              accountId: customerForOrder.id,
              accountType: 'CUSTOMER_AR',
              amount: arPortion,
            });
          }

          if (postings.length > 0) {
            const transactionId = detId(`transaction-${orderId}`);
            await tx.transaction.create({
              data: {
                id: transactionId,
                businessId: business.id,
                referenceId: order.id,
                type: 'SALE',
                description: `Sale for Order ${order.id}`,
                createdAt: orderDate,
                postings: {
                  create: postings.map((p) => ({
                    accountId: p.accountId,
                    accountType: p.accountType,
                    amount: p.amount,
                    createdAt: orderDate,
                  })),
                },
              },
            });
          }
        }
      });
    }
  } else {
    for (let orderIdx = 0; orderIdx < 8; orderIdx++) {
      const orderId = detId(`order-${tenantKey}-${orderIdx}`);

      const existingOrder = await prisma.order.findUnique({
        where: { id: orderId },
      });
      if (existingOrder) {
        continue;
      }

      const customerForOrder = customers[
        Math.floor(seededRng() * customers.length)
      ] as CustomerData;
      const daysAgo = Math.floor(seededRng() * 30);
      const orderDate = new Date(anchorDate);
      orderDate.setDate(orderDate.getDate() - daysAgo);

      const branchId = branchList[0][1];

      const numItems = Math.floor(seededRng() * 3) + 1;
      const items: OrderItemInput[] = [];
      let totalAmount = 0;

      for (const product of pickDistinctProducts(branchId, numItems)) {
        const qty = Math.floor(seededRng() * 2) + 1;
        const price = product.basePrice;
        items.push({ productId: product.id, quantity: qty, price });
        totalAmount += qty * price;
      }

      const netAmount = totalAmount;
      const amountPaid = netAmount;

      await prisma.$transaction(async (tx) => {
        const order = await tx.order.create({
          data: {
            id: orderId,
            businessId: business.id,
            branchId,
            customerId: customerForOrder.id,
            totalAmount: netAmount,
            discount: 0,
            paymentStatus: 'PAID',
            status: 'FINAL',
            createdBy: ownerUser.id,
            createdAt: orderDate,
            items: {
              create: items.map((item) => ({
                productId: item.productId,
                quantity: item.quantity,
                price: item.price,
              })),
            },
          },
          include: { items: true },
        });

        for (const item of items) {
          const instancesForOrder = await tx.productInstance.findMany({
            where: {
              productId: item.productId,
              branchId,
              status: 'AVAILABLE',
            },
            take: item.quantity,
          });

          if (instancesForOrder.length > 0) {
            await tx.productInstance.updateMany({
              where: {
                id: { in: instancesForOrder.map((i) => i.id) },
              },
              data: { status: 'SOLD' },
            });

            const inventoryMovementId = detId(
              `inventory-movement-${orderId}-${item.productId}`,
            );
            await tx.inventoryMovement.create({
              data: {
                id: inventoryMovementId,
                productId: item.productId,
                cabinetId: instancesForOrder[0]?.cabinetId || null,
                toCondition: instancesForOrder[0]?.condition || 'ORIGINAL_PULL',
                quantity: item.quantity,
                direction: 'OUT',
                referenceType: 'ORDER',
                referenceId: order.id,
                userId: ownerUser.id,
                businessId: business.id,
                createdAt: orderDate,
              },
            });
          }
        }

        const paymentId = detId(`payment-${orderId}`);
        await tx.payment.create({
          data: {
            id: paymentId,
            orderId: order.id,
            amount: amountPaid,
            method: 'CASH',
            receivedBy: ownerUser.id,
            createdAt: orderDate,
          },
        });

        const postings: Array<{
          accountId: string;
          accountType: string;
          amount: number;
        }> = [];
        if (netAmount > 0) {
          postings.push({
            accountId: 'REVENUE',
            accountType: 'REVENUE',
            amount: -netAmount,
          });
        }

        if (amountPaid > 0) {
          postings.push({
            accountId: 'CASH',
            accountType: 'ASSET',
            amount: amountPaid,
          });
        }

        if (postings.length > 0) {
          const transactionId = detId(`transaction-${orderId}`);
          await tx.transaction.create({
            data: {
              id: transactionId,
              businessId: business.id,
              referenceId: order.id,
              type: 'SALE',
              description: `Sale for Order ${order.id}`,
              createdAt: orderDate,
              postings: {
                create: postings.map((p) => ({
                  accountId: p.accountId,
                  accountType: p.accountType,
                  amount: p.amount,
                  createdAt: orderDate,
                })),
              },
            },
          });
        }
      });
    }
  }

  if (tenantKey === 'A' && managerUser) {
    const sessionId = detId(`register-session-${tenantKey}`);
    await prisma.cashRegisterSession.upsert({
      where: { id: sessionId },
      update: {},
      create: {
        id: sessionId,
        businessId: business.id,
        branchId: hafeezCentreId,
        openedById: managerUser.id,
        status: 'OPEN',
        openingBalance: 5000,
      },
    });
  }
}

const LARGE = {
  products: 5000,
  instances: 15000,
  customers: 2000,
  orders: 50000,
  batch: 1000,
};

/** Deterministic large-mode product price, derived from its index. */
const largePrice = (idx: number) => 1000 + ((idx * 37) % 9000);

/**
 * Benchmark dataset for k6: per tenant, 5k products, 15k instances, 2k
 * customers and 50k orders. Every row has a deterministic id and is written
 * with createMany({ skipDuplicates }), batch by batch, so re-runs are no-ops
 * and memory stays bounded. Large-mode stock is created with its final status
 * (every third instance SOLD) instead of being consumed order by order, and no
 * InventoryMovement rows are generated.
 */
async function seedLarge(tenantKey: 'A' | 'B', ownerUser: { id: string }) {
  const tenantData = tenants[tenantKey];
  const businessId = tenantData.id;
  console.log(`Generating large dataset for tenant ${tenantKey}...`);

  const branchIds = (
    await prisma.branch.findMany({
      where: { businessId },
      orderBy: { id: 'asc' },
      select: { id: true },
    })
  ).map((b) => b.id);
  const categoryIds = (
    await prisma.category.findMany({
      where: { businessId },
      orderBy: { name: 'asc' },
      select: { id: true },
    })
  ).map((c) => c.id);
  const cabinetsByBranch: Record<string, string[]> = {};
  for (const cabinet of await prisma.cabinet.findMany({
    where: { businessId },
    orderBy: { id: 'asc' },
  })) {
    (cabinetsByBranch[cabinet.branchId] ??= []).push(cabinet.id);
  }

  const productId = (i: number) => detId(`lproduct-${tenantKey}-${i}`);
  const customerId = (i: number) => detId(`lcustomer-${tenantKey}-${i}`);

  for (let start = 0; start < LARGE.products; start += LARGE.batch) {
    const end = Math.min(start + LARGE.batch, LARGE.products);
    const data: Prisma.ProductCreateManyInput[] = [];
    for (let i = start; i < end; i++) {
      data.push({
        id: productId(i),
        name: `Bench Part ${tenantKey}-${i}`,
        sku: `${tenantKey}-LSKU-${String(i).padStart(5, '0')}`,
        basePrice: largePrice(i),
        defaultCostPrice: Math.round(largePrice(i) * 0.6),
        businessId,
        categoryId: categoryIds[i % categoryIds.length],
      });
    }
    await prisma.product.createMany({ data, skipDuplicates: true });
    console.log(`  products ${end}/${LARGE.products}`);
  }

  for (let start = 0; start < LARGE.instances; start += LARGE.batch) {
    const end = Math.min(start + LARGE.batch, LARGE.instances);
    const data: Prisma.ProductInstanceCreateManyInput[] = [];
    for (let i = start; i < end; i++) {
      const branchId = branchIds[i % branchIds.length];
      const cabinets = cabinetsByBranch[branchId];
      data.push({
        id: detId(`linstance-${tenantKey}-${i}`),
        productId: productId(i % LARGE.products),
        branchId,
        cabinetId: cabinets[i % cabinets.length],
        condition: CONDITIONS[i % CONDITIONS.length],
        status: i % 3 === 0 ? 'SOLD' : 'AVAILABLE',
      });
    }
    await prisma.productInstance.createMany({ data, skipDuplicates: true });
    console.log(`  instances ${end}/${LARGE.instances}`);
  }

  for (let start = 0; start < LARGE.customers; start += LARGE.batch) {
    const end = Math.min(start + LARGE.batch, LARGE.customers);
    const data: Prisma.CustomerCreateManyInput[] = [];
    for (let i = start; i < end; i++) {
      data.push({
        id: customerId(i),
        name: `Bench Customer ${tenantKey}-${i}`,
        phone: `+9231${tenantKey === 'A' ? 1 : 2}${String(i).padStart(7, '0')}`,
        businessId,
        creditLimit: 50000,
      });
    }
    await prisma.customer.createMany({ data, skipDuplicates: true });
    console.log(`  customers ${end}/${LARGE.customers}`);
  }

  const anchorDate = new Date('2026-01-01T09:00:00+05:00');
  for (let start = 0; start < LARGE.orders; start += LARGE.batch) {
    const end = Math.min(start + LARGE.batch, LARGE.orders);
    const orders: Prisma.OrderCreateManyInput[] = [];
    const orderItems: Prisma.OrderItemCreateManyInput[] = [];
    const payments: Prisma.PaymentCreateManyInput[] = [];
    const transactions: Prisma.TransactionCreateManyInput[] = [];
    const postings: Prisma.PostingCreateManyInput[] = [];

    for (let i = start; i < end; i++) {
      const orderId = detId(`lorder-${tenantKey}-${i}`);
      const custId = customerId(i % LARGE.customers);
      const createdAt = new Date(anchorDate);
      createdAt.setDate(createdAt.getDate() - (i % 180));

      // 1-3 distinct products per order (1013 is coprime with 5000).
      let net = 0;
      const numItems = (i % 3) + 1;
      for (let j = 0; j < numItems; j++) {
        const pIdx = (i * 7 + j * 1013) % LARGE.products;
        const quantity = (j % 2) + 1;
        net += quantity * largePrice(pIdx);
        orderItems.push({
          id: detId(`lorderitem-${orderId}-${j}`),
          orderId,
          productId: productId(pIdx),
          quantity,
          price: largePrice(pIdx),
        });
      }

      // Every tenth order is udhar (unpaid, receivable); the rest are cash.
      const isUdhar = i % 10 === 0;
      orders.push({
        id: orderId,
        businessId,
        branchId: branchIds[i % branchIds.length],
        customerId: custId,
        totalAmount: net,
        discount: 0,
        status: 'FINAL',
        paymentStatus: isUdhar ? 'UNPAID' : 'PAID',
        createdBy: ownerUser.id,
        createdAt,
      });
      if (!isUdhar) {
        payments.push({
          id: detId(`lpayment-${orderId}`),
          orderId,
          amount: net,
          method: 'CASH',
          receivedBy: ownerUser.id,
          createdAt,
        });
      }

      const transactionId = detId(`ltransaction-${orderId}`);
      transactions.push({
        id: transactionId,
        businessId,
        referenceId: orderId,
        type: 'SALE',
        description: `Sale for Order ${orderId}`,
        createdAt,
      });
      postings.push(
        {
          id: detId(`lposting-${orderId}-revenue`),
          transactionId,
          accountId: 'REVENUE',
          accountType: 'REVENUE',
          amount: -net,
          createdAt,
        },
        isUdhar
          ? {
              id: detId(`lposting-${orderId}-ar`),
              transactionId,
              accountId: custId,
              accountType: 'CUSTOMER_AR',
              amount: net,
              createdAt,
            }
          : {
              id: detId(`lposting-${orderId}-cash`),
              transactionId,
              accountId: 'CASH',
              accountType: 'ASSET',
              amount: net,
              createdAt,
            },
      );
    }

    await prisma.$transaction([
      prisma.order.createMany({ data: orders, skipDuplicates: true }),
      prisma.orderItem.createMany({ data: orderItems, skipDuplicates: true }),
      prisma.payment.createMany({ data: payments, skipDuplicates: true }),
      prisma.transaction.createMany({
        data: transactions,
        skipDuplicates: true,
      }),
      prisma.posting.createMany({ data: postings, skipDuplicates: true }),
    ]);
    console.log(`  orders ${end}/${LARGE.orders}`);
  }
}

async function main() {
  const isLargeSeed = process.argv.includes('--large');
  console.log(`Starting seed (${isLargeSeed ? 'LARGE' : 'standard'} mode)...`);

  const hashedPassword = await hash(TEST_PASSWORD, 10);

  await prisma.user.upsert({
    where: { id: users.superAdmin.id },
    update: {},
    create: {
      id: users.superAdmin.id,
      name: users.superAdmin.name,
      email: users.superAdmin.email,
      password: hashedPassword,
      role: 'SUPER_ADMIN',
    },
  });

  const ownerA = await prisma.user.upsert({
    where: { id: users.ownerA.id },
    update: {},
    create: {
      id: users.ownerA.id,
      name: users.ownerA.name,
      email: users.ownerA.email,
      password: hashedPassword,
      role: 'OWNER',
    },
  });

  const managerA = await prisma.user.upsert({
    where: { id: users.managerA.id },
    update: {},
    create: {
      id: users.managerA.id,
      name: users.managerA.name,
      email: users.managerA.email,
      password: hashedPassword,
      role: 'MANAGER',
    },
  });

  const staffA = await prisma.user.upsert({
    where: { id: users.staffA.id },
    update: {},
    create: {
      id: users.staffA.id,
      name: users.staffA.name,
      email: users.staffA.email,
      password: hashedPassword,
      role: 'STAFF',
    },
  });

  const ownerB = await prisma.user.upsert({
    where: { id: users.ownerB.id },
    update: {},
    create: {
      id: users.ownerB.id,
      name: users.ownerB.name,
      email: users.ownerB.email,
      password: hashedPassword,
      role: 'OWNER',
    },
  });

  console.log(`Seeded users`);

  await seedTenant('A', ownerA, managerA, [staffA]);
  await seedTenant('B', ownerB, null, []);

  if (isLargeSeed) {
    await seedLarge('A', ownerA);
    await seedLarge('B', ownerB);
  }

  console.log(`Validating posting balances...`);
  const result = await prisma.$queryRaw<
    Array<{ transactionId: string; total: number }>
  >`SELECT "transactionId", SUM("amount") AS total FROM "Posting" GROUP BY "transactionId" HAVING ABS(SUM("amount")) > 0.001`;

  if (result && result.length > 0) {
    const offendingIds = result.map((r) => r.transactionId).join(', ');
    throw new Error(`Unbalanced transactions found: ${offendingIds}`);
  }
  console.log(`All transactions balanced successfully`);

  const stats = await Promise.all([
    prisma.user.count(),
    prisma.business.count(),
    prisma.branch.count(),
    prisma.product.count(),
    prisma.productInstance.count(),
    prisma.customer.count(),
    prisma.order.count(),
    prisma.transaction.count(),
    prisma.posting.count(),
    prisma.vendor.count(),
    prisma.cashRegisterSession.count(),
  ]);

  console.log(`
Seed completed successfully!
Row counts:
  Users: ${stats[0]}
  Businesses: ${stats[1]}
  Branches: ${stats[2]}
  Products: ${stats[3]}
  Product Instances: ${stats[4]}
  Customers: ${stats[5]}
  Orders: ${stats[6]}
  Transactions: ${stats[7]}
  Postings: ${stats[8]}
  Vendors: ${stats[9]}
  Cash Register Sessions: ${stats[10]}
  `);
}

main()
  .then(() => {
    process.exitCode = 0;
  })
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
