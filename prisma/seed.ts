import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';
import * as bcrypt from 'bcrypt';
import * as dotenv from 'dotenv';

dotenv.config();

const connectionString = process.env.DIRECT_URL || process.env.DATABASE_URL;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function main() {
  const adminId = 'kickat2021';
  const email = 'kickat2021@gmail.com';
  const rawPassword = 'kickat@2026';

  const hashedPassword = await bcrypt.hash(rawPassword, 10);

  const admin = await prisma.admin.upsert({
    where: { adminId },
    update: {
      email,
      password: hashedPassword,
      isActive: true,
      isBlocked: false,
    },
    create: {
      adminId,
      email,
      password: hashedPassword,
      name: 'Super Admin',
      role: 'SUPER_ADMIN',
      permissions: ['ALL'],
      isActive: true,
      isBlocked: false,
    },
  });

  console.log('✅ Admin user seeded successfully:', {
    id: admin.id,
    adminId: admin.adminId,
    email: admin.email,
  });
}

main()
  .catch((e) => {
    console.error('❌ Error seeding admin:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
    await pool.end();
  });
