import { Test, TestingModule } from '@nestjs/testing';
import { Erc1155Controller } from './erc1155.controller';

describe('Erc1155Controller', () => {
  let controller: Erc1155Controller;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [Erc1155Controller],
    }).compile();

    controller = module.get<Erc1155Controller>(Erc1155Controller);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
