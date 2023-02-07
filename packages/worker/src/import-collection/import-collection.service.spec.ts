import { Test, TestingModule } from '@nestjs/testing';
import { ImportCollectionService } from './import-collection.service';

describe('ImportCollectionService', () => {
  let service: ImportCollectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ImportCollectionService],
    }).compile();

    service = module.get<ImportCollectionService>(ImportCollectionService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
