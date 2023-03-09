import { Prisma } from '@nusa-nft/database';

const excludedModels = [
  'ItemLikes',
  'ItemViews',
  'Attributes',
  'Bid',
  'ItemActiveListing',
  'WatchList',
  'LazyMintListing',
  'NotificationDetailSale',
  'NotificationDetailOffer',
  'Notification',
  'MarketplaceListing',
  'MarketplaceSale',
  'MarketplaceOffer',
  'ImportedContracts',
  'TokenOwnerships',
  'TokenTransferHistory',
  'Erc1155TransferHistory',
  'RoyaltyPaid',
];

export function SoftDeleteMiddleware<
  T extends Prisma.BatchPayload = Prisma.BatchPayload,
>(): Prisma.Middleware {
  return async (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<T>,
  ): Promise<T> => {
    if (excludedModels.includes(params.model)) {
      return await next(params);
    }
    if (params.action == 'delete') {
      // Delete queries
      // Change action to an update
      params.action = 'update';
      params.args['data'] = { deleted: true };
    }
    if (params.action == 'deleteMany') {
      // Delete many queries
      params.action = 'updateMany';
      if (params.args.data != undefined) {
        params.args.data['deleted'] = true;
      } else {
        params.args['data'] = { deleted: true };
      }
    }

    if (params.action == 'findFirst' || params.action == 'findMany') {
      if (!params.args) {
        params.args = { where: { deleted: false } };
      } else {
        // Delete many queries
        params.args.where.deleted = false;
      }
    }

    return await next(params);
  };
}
