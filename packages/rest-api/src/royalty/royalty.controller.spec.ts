import { Test, TestingModule } from '@nestjs/testing';
import { RoyaltyController } from './royalty.controller';

describe('RoyaltyController', () => {
  let controller: RoyaltyController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RoyaltyController],
    }).compile();

    controller = module.get<RoyaltyController>(RoyaltyController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
