import { Strapi } from '@strapi/strapi';

export default ({ strapi }: { strapi: Strapi }) => ({
  async index(ctx) {
    // console.log({ 'ctx.request': ctx.request });
    // console.log({ 'ctx.request.query': ctx.request.query });
    // console.log({ ctx })
    const { page, name } = ctx.request.query;
    try {
      ctx.body = await strapi
        .plugin('nft-curate')
        .service('curatedCollectionService')
        .getCurated({ page, name });
    } catch (err) {
      ctx.throw(500, err);
    }
  },

  async curate(ctx) {
    const { body, headers } = ctx.request;
    const { collectionId, isCurated } = body;
    console.log({ body })
    try {
      ctx.body = await strapi
        .plugin('nft-curate') 
        .service('curatedCollectionService')
        .curate({ collectionId, isCurated });
    } catch (err) {
      ctx.throw(500, err);
    }
  }
});
