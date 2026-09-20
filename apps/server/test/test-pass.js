const bcrypt = require('bcrypt');
const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function main() {
  const hash = await bcrypt.hash('password123', 10);
  await prisma.user.update({
    where: { email: 'hafeez@deepkhata.com' },
    data: { password: hash, role: 'STAFF' }
  });
  console.log("Updated hafeez password and set to STAFF");
}
main().then(() => process.exit(0));
