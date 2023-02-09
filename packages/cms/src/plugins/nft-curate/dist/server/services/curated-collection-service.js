"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("@nusa-nft/database");
const resolve_image_1 = __importDefault(require("../utils/resolve-image"));
exports.default = ({ strapi }) => ({
    async getCurated({ page, name }) {
        const prisma = new database_1.PrismaClient();
        await prisma.$connect();
        let query = {
            take: 10,
            skip: 10 * (page - 1),
            include: {
                CuratedCollection: true,
                Creator: true,
            },
        };
        if (name) {
            query = {
                ...query,
                where: {
                    name
                }
            };
        }
        console.log(process.env);
        let collections = await prisma.collection.findMany(query);
        collections = collections.map((col) => ({
            ...col,
            banner_image: (0, resolve_image_1.default)(col.banner_image),
            logo_image: (0, resolve_image_1.default)(col.logo_image),
            featured_image: (0, resolve_image_1.default)(col.featured_image),
            isCurated: !!col.CuratedCollection,
            viewLink: `${process.env.NUSA_FRONTEND_URL}/collection/${col.slug}`
        }));
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
    async curate({ collectionId, isCurated }) {
        const prisma = new database_1.PrismaClient();
        await prisma.$connect();
        if (!isCurated) {
            await prisma.curatedCollection.delete({ where: { collectionId } });
        }
        else {
            const exists = await prisma.curatedCollection.findFirst({ where: { collectionId } });
            if (!exists) {
                await prisma.curatedCollection.create({ data: { collectionId } });
            }
        }
        await prisma.$disconnect();
        return {
            collectionId,
            isCurated
        };
    }
});
