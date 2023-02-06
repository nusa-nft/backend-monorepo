"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const database_1 = require("@nusa-nft/database");
const resolve_image_1 = __importDefault(require("../utils/resolve-image"));
exports.default = ({ strapi }) => ({
    async getNfts({ page, name }) {
        const prisma = new database_1.PrismaClient();
        await prisma.$connect();
        let query = {
            take: 10,
            skip: 10 * (page - 1),
            include: {
                Curated: true,
                Creator: true,
                Collection: true,
            }
        };
        if (name) {
            query = {
                ...query,
                where: {
                    name
                }
            };
        }
        let items = await prisma.item.findMany(query);
        items = items.map((it) => ({
            ...it,
            image: (0, resolve_image_1.default)(it.image),
            isCurated: !!it.Curated,
        }));
        const dataCount = await prisma.item.aggregate({
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
            records: items,
        };
    },
    async curate({ itemId, isCurated }) {
        const prisma = new database_1.PrismaClient();
        await prisma.$connect();
        if (!isCurated) {
            await prisma.curatedItems.delete({ where: { itemId } });
        }
        else {
            const exists = await prisma.curatedItems.findFirst({ where: { itemId } });
            if (!exists) {
                await prisma.curatedItems.create({ data: { itemId } });
            }
        }
        await prisma.$disconnect();
        return {
            itemId,
            isCurated
        };
    }
});
