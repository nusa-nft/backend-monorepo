import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function deleteCollection() {
  const deleteRoyalty = await prisma.royalty.deleteMany({})
  const deleteCollection = await prisma.collection.deleteMany({});
  const deleteUser = await prisma.user.deleteMany({});
  const deleteCategory = await prisma.category.deleteMany({})

  console.log(deleteCollection, deleteUser, deleteRoyalty, deleteCategory);
}
deleteCollection()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
