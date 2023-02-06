import { Controller, Get, Param, Query } from '@nestjs/common';
import { SearchService } from './search.service';
import { ApiTags } from '@nestjs/swagger';
import { PaginationQueryParams } from './dto/search.dto';

@ApiTags('Search')
@Controller('search')
export class SearchController {
  constructor(private readonly searchService: SearchService) {}

  @Get(':name')
  getSuggestion(@Param('name') name: string) {
    return this.searchService.getSuggestion(name);
  }

  @Get('accounts/:name')
  getAccounts(
    @Param('name') name: string,
    @Query() query: PaginationQueryParams,
  ) {
    return this.searchService.getAccountResult(name, query.page);
  }

  @Get('collections/:name')
  getCollections(
    @Param('name') name: string,
    @Query() query: PaginationQueryParams,
  ) {
    return this.searchService.getCollectionResult(name, query.page);
  }
}
