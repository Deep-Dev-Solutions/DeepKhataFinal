const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  await prisma.user.update({
    where: { email: 'hafeez@deepkhata.com' },
    data: { role: 'OWNER' }
  });
  console.log("Restored hafeez role to OWNER");
}
main().then(() => process.exit(0));
