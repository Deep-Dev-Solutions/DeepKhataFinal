import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('Checking for businesses without branches...');
  const businessesWithoutBranch = await prisma.business.findMany({
    where: {
      branches: {
        none: {},
      },
    },
  });

  console.log(
    `Found ${businessesWithoutBranch.length} businesses with 0 branches.`,
  );

  for (const b of businessesWithoutBranch) {
    const branch = await prisma.branch.create({
      data: {
        name: 'Main Branch',
        businessId: b.id,
        phone: b.phone || null,
        location: b.address || null,
      },
    });
    console.log(
      `Created default 'Main Branch' (${branch.id}) for business '${b.name}' (${b.id}).`,
    );
  }

  console.log('Branch backfill completed successfully.');
}

main()
  .catch((e) => {
    console.error('Error ensuring default branches:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
