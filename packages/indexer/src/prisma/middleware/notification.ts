import { Prisma } from '@nusa-nft/database';
import { events } from '../../lib/newEventEmitter';

const models = ['MarketplaceSale', 'MarketplaceOffer'];

export function NotificationMiddleware<
  T extends Prisma.BatchPayload = Prisma.BatchPayload,
>(): Prisma.Middleware {
  return async (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<T>,
  ): Promise<T> => {
    if (models.includes(params.model) && params.action == 'create') {
      const data = params.args.data;

      if (params.model == 'MarketplaceOffer') {
        events.emit('notification', { notification: 'offer', data });
      }

      if (params.model == 'MarketplaceSale') {
        events.emit('notification', { notification: 'sale', data });
      }

      return await next(params);
    } else {
      return await next(params);
    }
  };
}
