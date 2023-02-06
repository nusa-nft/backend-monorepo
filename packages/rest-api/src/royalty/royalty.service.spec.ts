import { Test, TestingModule } from '@nestjs/testing';
import { RoyaltyService } from './royalty.service';

describe('RoyaltyService', () => {
  let service: RoyaltyService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RoyaltyService],
    }).compile();

    service = module.get<RoyaltyService>(RoyaltyService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
