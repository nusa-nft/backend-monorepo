import { Prisma, PrismaClient } from '@nusa-nft/database';
import { slugify as _slugify } from '../../lib/slugify';

export function slugify<T extends Prisma.BatchPayload = Prisma.BatchPayload>(
  client: PrismaClient,
  models: string[],
): Prisma.Middleware {
  return async (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<T>,
  ): Promise<T> => {
    if (
      (params.action === 'create' || params.action === 'update') &&
      models.includes(params.model) &&
      !params.args.data.deleted // is not soft delete
    ) {
      const {
        args: { data },
      } = params;
      const slug = _slugify(data.name);

      const lastInserts = await client.collection.findMany({
        take: 2,
        where: {
          slug: { startsWith: slug },
          deleted: false,
        },
        orderBy: { id: 'desc' },
      });

      if (lastInserts.length == 0) {
        params.args.data.slug = slug;
        const result = await next(params);
        return result;
      }

      if (lastInserts.length == 1) {
        params.args.data.slug = `${slug}-${1}`;
        const result = await next(params);
        return result;
      }

      if (lastInserts.length > 1) {
        const split = lastInserts[0].slug.split('-');
        const index = Number(split[split.length - 1]);
        const nextIndex = index + 1;
        params.args.data.slug = `${slug}-${nextIndex}`;
        const result = await next(params);
        return result;
      }
    }

    return await next(params);
  };
}
