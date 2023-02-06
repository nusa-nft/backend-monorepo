import { Controller, Param, Sse } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { Observable, Subject } from 'rxjs';
import { map } from 'rxjs/operators';

interface MessageEvent {
  data: string | object;
  id?: string;
  type?: string;
}

@Controller('sse')
export class SseController {
  constructor(private readonly eventService: EventEmitter2) {}

  @Sse('/event/:walletAddress')
  sse(@Param('walletAddress') walletAddress: string): Observable<MessageEvent> {
    const subject$ = new Subject();
    this.eventService.on('marketplaceSale', (eventData) => {
      if (
        walletAddress !=
          eventData.notificationData.saleData.lister.wallet_address &&
        walletAddress !=
          eventData.notificationData.saleData.buyer.wallet_address
      )
        return;
      const data = eventData.notificationData;
      subject$.next({ data });
    });

    this.eventService.on('marketplaceOffer', (eventData) => {
      if (
        walletAddress !=
          eventData.notificationData.offerData.lister.wallet_address &&
        walletAddress !=
          eventData.notificationData.offerData.offeror.wallet_address
      )
        return;
      const data = eventData.notificationData;

      subject$.next({ data });
    });

    return subject$.pipe(
      map(
        (data: MessageEvent): MessageEvent => ({
          data,
        }),
      ),
    );
  }
}
