import { PrismaClient } from '@prisma/client'
const prisma = new PrismaClient({ log: ['query', 'info', 'warn', 'error'] })
async function main() {
  const users = await prisma.user.findMany({ take: 1 })
  console.log(users)
}
main()
  .catch(e => { console.error(e); process.exit(1) })
  .finally(async () => { await prisma.$disconnect() })
