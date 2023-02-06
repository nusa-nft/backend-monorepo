"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = ({ strapi }) => ({
    async index(ctx) {
        // console.log({ 'ctx.request': ctx.request });
        // console.log({ 'ctx.request.query': ctx.request.query });
        // console.log({ ctx })
        const { page, name } = ctx.request.query;
        try {
            ctx.body = await strapi
                .plugin('nft-curate')
                .service('nftService')
                .getNfts({ page, name });
        }
        catch (err) {
            ctx.throw(500, err);
        }
    },
    async curate(ctx) {
        const { body, headers } = ctx.request;
        const { itemId, isCurated } = body;
        try {
            ctx.body = await strapi
                .plugin('nft-curate')
                .service('nftService')
                .curate({ itemId, isCurated });
        }
        catch (err) {
            ctx.throw(500, err);
        }
    }
});
