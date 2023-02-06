import { Test, TestingModule } from '@nestjs/testing';
import { Erc1155Service } from './erc1155.service';

describe('Erc1155Service', () => {
  let service: Erc1155Service;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [Erc1155Service],
    }).compile();

    service = module.get<Erc1155Service>(Erc1155Service);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
