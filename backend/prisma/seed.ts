/* eslint-disable no-console */
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prisma = new PrismaClient();

async function hash(pw: string) {
  return bcrypt.hash(pw, 12);
}

async function main() {
  console.log('Seeding database...');

  const branchA = await prisma.branch.create({
    data: {
      name: "Sam's Cafe - Galiveedu",
      address: 'Kadiri Road, Galiveedu',
      city: 'Galiveedu',
      state: 'Andhra Pradesh',
      country: 'India',
      phone: '9515475247',
      email: 'galiveedu@samscafe.in',
      openingTime: '07:00',
      closingTime: '22:30',
      status: 'OPEN',
    },
  });

  const branchB = await prisma.branch.create({
    data: {
      name: "Sam's Cafe - Kurnool",
      address: 'Main Bazaar Road',
      city: 'Kurnool',
      state: 'Andhra Pradesh',
      country: 'India',
      phone: '9515475248',
      email: 'kurnool@samscafe.in',
      openingTime: '07:00',
      closingTime: '22:30',
      status: 'OPENING_SOON',
    },
  });

  const superAdmin = await prisma.employee.create({
    data: {
      fullName: 'Sam (Owner)',
      email: 'owner@samscafe.in',
      loginId: 'admin',
      passwordHash: await hash('Admin@12345'),
      role: 'SUPER_ADMIN',
      department: 'Management',
    },
  });

  const managerA = await prisma.employee.create({
    data: {
      fullName: 'Branch Manager A',
      loginId: 'manager1',
      passwordHash: await hash('Manager@12345'),
      role: 'MANAGER',
      branchId: branchA.id,
      department: 'Operations',
    },
  });
  await prisma.branch.update({ where: { id: branchA.id }, data: { managerId: managerA.id } });

  const managerB = await prisma.employee.create({
    data: {
      fullName: 'Branch Manager B',
      loginId: 'manager2',
      passwordHash: await hash('Manager@12345'),
      role: 'MANAGER',
      branchId: branchB.id,
      department: 'Operations',
    },
  });
  await prisma.branch.update({ where: { id: branchB.id }, data: { managerId: managerB.id } });

  await prisma.employee.createMany({
    data: [
      { fullName: 'Waiter One', loginId: 'waiter1', passwordHash: await hash('Waiter@12345'), role: 'SERVICE_EMPLOYEE', branchId: branchA.id },
      { fullName: 'Waiter Two', loginId: 'waiter2', passwordHash: await hash('Waiter@12345'), role: 'SERVICE_EMPLOYEE', branchId: branchB.id },
      { fullName: 'Cook One', loginId: 'kitchen1', passwordHash: await hash('Kitchen@12345'), role: 'KITCHEN_EMPLOYEE', branchId: branchA.id },
      { fullName: 'Cook Two', loginId: 'kitchen2', passwordHash: await hash('Kitchen@12345'), role: 'KITCHEN_EMPLOYEE', branchId: branchB.id },
    ],
  });

  await prisma.customer.createMany({
    data: [{ fullName: 'Test Customer One', phone: '9000000001' }, { fullName: 'Test Customer Two', phone: '9000000002' }],
  });

  const categoryNames = ['Tiffins', 'Biryani & Rice', 'Curries & Meals', 'Starters', 'Beverages', 'Desserts'];
  const categories = await Promise.all(
    categoryNames.map((name) => prisma.category.create({ data: { name, branchId: branchA.id } }))
  );
  const byName = (n: string) => categories.find((c) => c.name === n)!.id;

  await prisma.item.createMany({
    data: [
      { name: 'Masala Dosa', categoryId: byName('Tiffins'), branchId: branchA.id, price: 60, description: 'Crisp rice crepe with spiced potato filling.' },
      { name: 'Idli (4 pcs)', categoryId: byName('Tiffins'), branchId: branchA.id, price: 40, description: 'Steamed rice cakes, sambar and chutney.' },
      { name: 'Pesarattu', categoryId: byName('Tiffins'), branchId: branchA.id, price: 55, description: 'Green gram dosa, Andhra style.' },
      { name: 'Chicken Biryani', categoryId: byName('Biryani & Rice'), branchId: branchA.id, price: 220, description: 'Rayalaseema style, served with raita.' },
      { name: 'Veg Biryani', categoryId: byName('Biryani & Rice'), branchId: branchA.id, price: 150, description: 'Seasonal vegetables, jeera rice.' },
      { name: 'Mutton Biryani', categoryId: byName('Biryani & Rice'), branchId: branchA.id, price: 260, description: 'Tender mutton, long grain rice.' },
      { name: 'Gongura Mutton', categoryId: byName('Curries & Meals'), branchId: branchA.id, price: 240, description: 'Tangy sorrel-leaf mutton curry.' },
      { name: 'Full Meals (Veg)', categoryId: byName('Curries & Meals'), branchId: branchA.id, price: 130, description: 'Rice, dal, two curries, curd, pickle, papad.' },
      { name: 'Mirchi Bajji', categoryId: byName('Starters'), branchId: branchA.id, price: 30, description: 'Stuffed chilli fritters.' },
      { name: 'Filter Coffee', categoryId: byName('Beverages'), branchId: branchA.id, price: 25, description: 'Strong South Indian filter coffee.' },
      { name: 'Masala Chai', categoryId: byName('Beverages'), branchId: branchA.id, price: 20, description: 'Freshly brewed spiced tea.' },
      { name: 'Gulab Jamun (2 pcs)', categoryId: byName('Desserts'), branchId: branchA.id, price: 35, description: 'Warm syrup-soaked milk dumplings.' },
    ],
  });

  await prisma.restaurantTable.createMany({
    data: [1, 2, 3, 4, 5, 6, 7, 8].map((n) => ({ number: n, capacity: n % 2 === 0 ? 4 : 2, branchId: branchA.id })),
  });
  await prisma.restaurantTable.createMany({
    data: [1, 2, 3].map((n) => ({ number: n, capacity: 4, branchId: branchB.id })),
  });

  await prisma.coupon.create({
    data: {
      code: 'WELCOME10',
      description: '10% off for first-time customers',
      discountType: 'PERCENTAGE',
      discountValue: 10,
      minOrder: 150,
      maxDiscount: 100,
      startDate: new Date(),
      expiryDate: new Date(Date.now() + 1000 * 60 * 60 * 24 * 365),
      branchId: branchA.id,
    },
  });

  console.log('Seed complete.');
  console.log('');
  console.log('Demo logins (development only - change before production):');
  console.log('  Super Admin:  loginId=admin      password=Admin@12345');
  console.log('  Manager:      loginId=manager1   password=Manager@12345');
  console.log('  Waiter:       loginId=waiter1    password=Waiter@12345');
  console.log('  Kitchen:      loginId=kitchen1   password=Kitchen@12345');
  console.log('  Customer OTP login: use phone 9000000001 (any phone works - OTP prints to this console in MOCK mode)');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
