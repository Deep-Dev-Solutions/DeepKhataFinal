import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const business = await prisma.business.findFirst();
  if (!business) {
    console.log("No business found. Cannot seed Walk-In Customer.");
    return;
  }

  const defaultPhone = "00000000000";

  let walkIn = await prisma.customer.findFirst({
    where: { phone: defaultPhone, businessId: business.id }
  });

  if (!walkIn) {
    walkIn = await prisma.customer.create({
      data: {
        name: "Walk-In Customer",
        phone: defaultPhone,
        creditLimit: 0,
        businessId: business.id,
      }
    });
    console.log("Seeded Walk-In Customer:", walkIn.id);
  } else {
    console.log("Walk-In Customer already exists:", walkIn.id);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
