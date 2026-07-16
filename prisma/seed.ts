import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs';
import cuid from 'cuid';
import { PERMISSIONS_GROUPS } from '../src/lib/permissions';

const prisma = new PrismaClient()

async function main() {
  console.log('Start seeding ...');

  // 1. Resolve (find-or-create) the Admin role FIRST.
  //    Everything else depends on this existing before we touch Users or other Roles.
  console.log('Resolving Admin role...');
  const adminRole = await prisma.role.upsert({
    where: { name: 'Admin' },
    update: {},
    create: {
      name: 'Admin',
      description: 'Administrator with all permissions',
    },
  });

  // 2. Reassign every user NOT on the Admin role to Admin, before we delete any roles.
  //    This always runs now (previously it was skipped when Admin didn't exist yet,
  //    which is what caused the FK violation on role deletion below).
  await prisma.user.updateMany({
    where: { roleId: { not: adminRole.id } },
    data: { roleId: adminRole.id },
  });

  // 3. Now it's safe to clear out old permissions/roles for a clean reseed.
  console.log('Clearing old permissions and roles...');
  await prisma.rolePermission.deleteMany({});
  await prisma.permission.deleteMany({});
  await prisma.role.deleteMany({
    where: { name: { notIn: ['Admin'] } },
  });
  console.log('Old data cleared.');

  // 4. Seed all permissions from the single source of truth.
  console.log('Seeding permissions...');
  const flatPermissions = Object.entries(PERMISSIONS_GROUPS).flatMap(([group, actions]) =>
    actions.map(action => `${group}:${action}`)
  );

  for (const name of flatPermissions) {
    await prisma.permission.upsert({
      where: { name },
      update: {},
      create: { name },
    });
  }
  console.log(`Seeded ${flatPermissions.length} permissions.`);

  // 5. Attach ALL permissions to Admin (using the same adminRole from step 1 — no redeclare).
  console.log('Assigning permissions to roles...');
  const allPermissionsFromDb = await prisma.permission.findMany();

  await prisma.rolePermission.createMany({
    data: allPermissionsFromDb.map(p => ({
      roleId: adminRole.id,
      permissionId: p.id,
    })),
    skipDuplicates: true,
  });
  console.log('Admin role configured with all permissions.');

  // Organizer Role
  const organizerPermNames = [
    'Dashboard:Access',
    'Events:Create', 'Events:Read', 'Events:Update', 'Events:Delete',
    'Reports:Access',
    'Staff Management:Access',
  ];
  const organizerPerms = await prisma.permission.findMany({ where: { name: { in: organizerPermNames } } });

  const organizerRole = await prisma.role.create({
    data: {
      name: 'Organizer',
      description: 'Event organizer with permissions to create and manage their own events.',
    },
  });

  await prisma.rolePermission.createMany({
    data: organizerPerms.map(p => ({ roleId: organizerRole.id, permissionId: p.id })),
  });
  console.log('Organizer role created.');

  // Staff Role
  const staffPermNames = [
    'Dashboard:Access',
    'Scan QR:Access',
  ];
  const staffPerms = await prisma.permission.findMany({ where: { name: { in: staffPermNames } } });

  const staffRole = await prisma.role.create({
    data: {
      name: 'Staff',
      description: 'Staff member with limited permissions for event operations like scanning tickets.',
    },
  });

  await prisma.rolePermission.createMany({
    data: staffPerms.map(p => ({ roleId: staffRole.id, permissionId: p.id })),
  });
  console.log('Staff role created.');

  // 6. Ensure an Admin user exists (or is correctly linked to the Admin role).
  const adminPassword = 'Admin@123';
  const hashedPassword = await bcrypt.hash(adminPassword, 10);

  const existingAdmin = await prisma.user.findFirst({
    where: { role: { name: 'Admin' } },
  });

  if (existingAdmin) {
    await prisma.user.update({
      where: { id: existingAdmin.id },
      data: { roleId: adminRole.id },
    });
    console.log(`Admin user (${existingAdmin.email}) role updated.`);
  } else {
    await prisma.user.create({
      data: {
        id: cuid(),
        firstName: 'Admin',
        lastName: 'User',
        phoneNumber: '0912345678',
        email: 'admin@example.com',
        password: hashedPassword,
        roleId: adminRole.id,
        nibBankAccount: '7000101672811', // Placeholder account
        status: 'ACTIVE',
        passwordChangeRequired: true,
        tokenVersion: 1,
      },
    });
    console.log('Admin user created.');
  }

  console.log('Seeding finished successfully.');
}

main()
  .catch((e) => {
    console.error('An error occurred during seeding:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });