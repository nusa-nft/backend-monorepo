import { HttpModule } from '@nestjs/axios';
import { Module } from '@nestjs/common';
import { IndexerService } from './indexer.service';

@Module({
  imports: [HttpModule],
  providers: [IndexerService],
  exports: [IndexerService],
})
export class IndexerModule {}
