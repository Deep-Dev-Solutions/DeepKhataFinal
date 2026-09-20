import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
async function main() {
  const users = await prisma.user.findMany();
  console.log("Users:", users.map(u => ({ email: u.email, role: u.role, password: u.password })));
  
  if (users.length > 0) {
    const userToUpdate = users.find(u => u.email === 'staff@example.com') || users[0];
    await prisma.user.update({
      where: { id: userToUpdate.id },
      data: { role: 'STAFF' }
    });
    console.log("Updated user to STAFF:", userToUpdate.email);
  }
}
main()
  .catch(e => console.error(e))
  .finally(async () => await prisma.$disconnect());
