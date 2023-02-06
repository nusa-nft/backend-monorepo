import { Controller, Get, Query } from '@nestjs/common';
import { RoyaltyReceivedHistoryParams } from './royalty.dto';
import { RoyaltyService } from './royalty.service';

@Controller('royalty')
export class RoyaltyController {
  constructor(private readonly royaltyService: RoyaltyService) {}

  @Get('')
  async getRoyaltyReceivedHistory(
    @Query() params: RoyaltyReceivedHistoryParams,
  ) {
    return this.royaltyService.getRoyaltyReceivedHistory(params);
  }
}
