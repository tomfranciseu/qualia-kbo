import { createKboClient } from '../client.js';

export async function loadDeleteAll(): Promise<void> {
  const prisma = createKboClient();

  const deleteOperations1 = [
    prisma.kBOContact.deleteMany(),
    prisma.kBOAddress.deleteMany(),
    prisma.denomination.deleteMany(),
  ];

  try {
    console.log('Starting deletion of previous data...');
    await prisma.$transaction(deleteOperations1).catch((error) => {
      console.error('Error deleting other data:', error);
    });
    console.log('All data deleted successfully');
    console.log('Starting deleting of establishment data...');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "kbo"."Establishment" CASCADE;`).catch((error) => {
      console.error('Error deleting establishment data with cascade:', error);
    });
    console.log('Starting deleting of entreprise data...');
    await prisma.$executeRawUnsafe(`TRUNCATE TABLE "kbo"."Enterprise" CASCADE;`).catch((error) => {
      console.error('Error deleting enterprise data with cascade:', error);
    });
  } catch (error) {
    console.error('Failed to delete data:', error);
    throw error;
  }
}
