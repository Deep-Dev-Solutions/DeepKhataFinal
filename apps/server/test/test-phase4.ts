import { PrismaClient } from '@prisma/client';
import { InventoryService } from '../src/inventory/inventory.service';
import { ProductsService } from '../src/products/products.service';
import { VendorsService } from '../src/vendors/vendors.service';

const prisma = new PrismaClient();

async function main() {
  console.log('--- Starting Phase 4 Testing ---');

  // 1. Find or create a test business & user
  let user = await prisma.user.findFirst({
    include: { business: true },
  });

  if (!user || !user.businessId) {
    console.log(
      'No user with business found. Creating test business and user...',
    );
    user = await prisma.user.create({
      data: {
        name: 'Test Owner',
        email: `test_owner_${Date.now()}@example.com`,
        password: 'password123',
        role: 'OWNER',
        business: {
          create: {
            name: 'Phase 4 Test Business',
            slug: `test-biz-${Date.now()}`,
          },
        },
      },
      include: { business: true },
    });
  }

  const businessId = user.businessId!;
  const userId = user.id;
  console.log(`Using user: ${user.name} (${user.id}), Business: ${businessId}`);

  // 2. Ensure test branch & cabinet exist
  let branch = await prisma.branch.findFirst({
    where: { businessId, deletedAt: null },
    include: { cabinets: true },
  });

  if (!branch) {
    branch = await prisma.branch.create({
      data: {
        name: 'Main Branch Test',
        businessId,
        cabinets: {
          create: {
            name: 'Cabinet A1',
            location: 'Rack 1 -> Shelf 2',
            businessId,
          },
        },
      },
      include: { cabinets: true },
    });
  }

  let cabinet = branch.cabinets[0];
  if (!cabinet) {
    cabinet = await prisma.cabinet.create({
      data: {
        name: 'Cabinet A1',
        location: 'Rack 1 -> Shelf 2',
        branchId: branch.id,
        businessId,
      },
    });
  }

  // 3. Create test vendor
  const vendor = await prisma.vendor.create({
    data: {
      businessName: `Test Supplier ${Date.now()}`,
      contactName: 'Supplier Rep',
      phone: '03001234567',
      businessId,
    },
  });
  console.log(`Created test vendor: ${vendor.businessName} (${vendor.id})`);

  // 4. Create test product with defaultCostPrice
  const product = await prisma.product.create({
    data: {
      name: `Test Device ${Date.now()}`,
      sku: `SKU-${Date.now()}`,
      basePrice: 50000,
      defaultCostPrice: 38000,
      businessId,
    },
  });
  console.log(
    `Created test product: ${product.name} (SKU: ${product.sku}, defaultCostPrice: ${product.defaultCostPrice})`,
  );

  // 5. Test Restock Hub service: add restock batch with unitCost and vendorId
  const inventoryService = new InventoryService(prisma as any);
  const restockPayload = {
    items: [
      {
        productId: product.id,
        branchId: branch.id,
        cabinetId: cabinet.id,
        condition: 'ORIGINAL_PULL',
        quantity: 3,
        unitCost: 39500,
        vendorId: vendor.id,
        notes: 'Batch shipment from vendor invoice #101',
      },
      {
        productId: product.id,
        branchId: branch.id,
        cabinetId: cabinet.id,
        condition: 'MINOR_SCRATCHES',
        quantity: 2,
        unitCost: 36000,
        vendorId: vendor.id,
        notes: 'Batch shipment second tier',
      },
    ],
  };

  console.log('Executing Restock Hub operation with unitCost & vendorId...');
  const restockResult = await inventoryService.restock(userId, restockPayload);
  console.log('Restock result:', restockResult.message);

  // 6. Verify ProductInstance records created
  const instances = await prisma.productInstance.findMany({
    where: { productId: product.id },
  });
  console.log(`Found ${instances.length} created ProductInstances.`);
  if (instances.length !== 5) {
    throw new Error(`Expected 5 instances, got ${instances.length}`);
  }

  for (const inst of instances) {
    if (!inst.unitCost) {
      throw new Error(`Instance ${inst.id} missing unitCost!`);
    }
    if (inst.vendorId !== vendor.id) {
      throw new Error(
        `Instance ${inst.id} vendorId mismatch! Expected ${vendor.id}, got ${inst.vendorId}`,
      );
    }
  }
  console.log('✔ All ProductInstances have valid unitCost and vendorId!');

  // 7. Test getProductDetails from ProductsService
  const productsService = new ProductsService(prisma as any);
  console.log('Testing getProductDetails...');
  const details = await productsService.getProductDetails(userId, product.id);
  console.log(`Product Details returned: Stock = ${details.product.stock}`);
  console.log(
    `Instances count = ${details.instances.length}, Movements count = ${details.movements.length}`,
  );

  if (details.product.stock !== 5) {
    throw new Error(
      `Expected product stock to be 5, got ${details.product.stock}`,
    );
  }
  if (details.instances.length !== 5) {
    throw new Error(
      `Expected 5 instances in details, got ${details.instances.length}`,
    );
  }
  if (details.movements.length < 2) {
    throw new Error(
      `Expected at least 2 movements, got ${details.movements.length}`,
    );
  }
  console.log('✔ getProductDetails verified successfully!');

  // 8. Test getVendorById from VendorsService
  const vendorsService = new VendorsService(prisma as any);
  console.log('Testing getVendorById...');
  const vendorProfile = await vendorsService.getVendorById(userId, vendor.id);
  console.log(
    'Vendor Profile suppliedInventory:',
    vendorProfile.vendor.suppliedInventory,
  );

  if (
    !vendorProfile.vendor.suppliedInventory ||
    vendorProfile.vendor.suppliedInventory.length === 0
  ) {
    throw new Error('Supplied inventory is empty for vendor!');
  }

  const supplied = vendorProfile.vendor.suppliedInventory;
  console.log(`Supplied inventory batches count: ${supplied.length}`);
  const totalSuppliedQty = supplied.reduce(
    (sum: number, s: any) => sum + s.quantity,
    0,
  );
  console.log(`Total supplied units: ${totalSuppliedQty}`);

  if (totalSuppliedQty !== 5) {
    throw new Error(
      `Expected total supplied units to be 5, got ${totalSuppliedQty}`,
    );
  }
  for (const s of supplied) {
    console.log(
      `- Batch: ${s.productName}, Branch: ${s.branchName}, Qty: ${s.quantity}, UnitCost: ${s.unitCost}`,
    );
    if (!s.unitCost) {
      throw new Error(`Supplied inventory item missing unitCost!`);
    }
  }
  console.log('✔ getVendorById with Supplied Inventory verified successfully!');

  // 9. Clean up test records
  console.log('Cleaning up test data...');
  await prisma.inventoryMovement.deleteMany({
    where: { productId: product.id },
  });
  await prisma.productInstance.deleteMany({ where: { productId: product.id } });
  await prisma.product.delete({ where: { id: product.id } });
  await prisma.vendor.delete({ where: { id: vendor.id } });
  console.log('✔ Cleaned up test data.');

  console.log('--- Phase 4 Testing PASSED with 100% success! ---');
}

main()
  .catch((e) => {
    console.error('Test failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
