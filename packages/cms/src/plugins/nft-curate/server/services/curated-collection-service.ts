import { Strapi } from '@strapi/strapi';
import { Collection, CuratedCollection, Item, Prisma, PrismaClient } from '@nusa-nft/database';
import resolveImage from '../utils/resolve-image';

export default ({ strapi }: { strapi: Strapi }) => ({
  async getCurated({ page, name }: { page: number, name?: string }) {
    const prisma = new PrismaClient();
    await prisma.$connect();

    let query: Prisma.CollectionFindManyArgs = {
      take: 10,
      skip: 10 * (page - 1),
      include: {
        CuratedCollection: true,
        Creator: true,
      },
    }

    if (name) {
      query = {
        ...query,
        where: {
          name
        }
      }
    }

    console.log(process.env);

    let collections = await prisma.collection.findMany(query);
    collections = collections.map((col: Collection & { CuratedCollection }) => ({
      ...col,
      banner_image: resolveImage(col.banner_image),
      logo_image: resolveImage(col.logo_image),
      featured_image: resolveImage(col.featured_image),
      isCurated: !!col.CuratedCollection,
      viewLink: `${process.env.NUSA_FRONTEND_URL}/collection/${col.slug}` 
    }))

    const dataCount = await prisma.collection.aggregate({
      _count: true,
      where: query.where,
    });

    await prisma.$disconnect();

    return {
      metadata: {
        page,
        perPage: 10,
        pageCount: Math.ceil(dataCount._count / 10),
        totalCount: dataCount._count,
      },
      records: collections,
    };
  },

  async curate({ collectionId, isCurated }: { collectionId: number, isCurated: boolean }) {
    const prisma = new PrismaClient();
    await prisma.$connect();

    if (!isCurated) {
      await prisma.curatedCollection.delete({ where: { collectionId }})
    } else {
      const exists = await prisma.curatedCollection.findFirst({ where: { collectionId }});
      if (!exists) {
        await prisma.curatedCollection.create({ data: { collectionId }});
      }
    }

    await prisma.$disconnect();

    return {
      collectionId,
      isCurated
    }
  }
});
