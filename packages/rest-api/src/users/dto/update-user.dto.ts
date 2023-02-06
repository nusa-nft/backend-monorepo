import { ApiPropertyOptional } from '@nestjs/swagger';

export class UpdateUserDto {
  @ApiPropertyOptional()
  first_name: string;
  @ApiPropertyOptional()
  last_name: string;
  @ApiPropertyOptional()
  cover_picture: string;
  @ApiPropertyOptional()
  social_media_url: object;
  @ApiPropertyOptional()
  profile_picture: string;
  @ApiPropertyOptional()
  description: string;
  @ApiPropertyOptional()
  username: string;
  @ApiPropertyOptional()
  email: string;
  @ApiPropertyOptional()
  twitter_link: string;
  @ApiPropertyOptional()
  instagram_link: string;
  @ApiPropertyOptional()
  website_link: string;
}
