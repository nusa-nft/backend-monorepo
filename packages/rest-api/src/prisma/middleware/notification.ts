import { Prisma } from '@nusa-nft/database';
import { events } from '../../lib/newEventEmitter';

export function NotificationMiddleware<
  T extends Prisma.BatchPayload = Prisma.BatchPayload,
>(): Prisma.Middleware {
  return async (
    params: Prisma.MiddlewareParams,
    next: (params: Prisma.MiddlewareParams) => Promise<T>,
  ): Promise<T> => {
    if (params.model == 'LazyMintSale' && params.action == 'create') {
      const data = params.args.data;
      events.emit('notification', { notification: true, data });
      return await next(params);
    } else {
      return await next(params);
    }
  };
}
