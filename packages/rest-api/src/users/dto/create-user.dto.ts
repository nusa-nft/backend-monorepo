import { ApiProperty } from '@nestjs/swagger';

export class CreateUserDto {
  @ApiProperty()
  wallet_address: string;
  @ApiProperty()
  collections: string;
  @ApiProperty()
  first_name: string;
  @ApiProperty()
  last_name: string;
  @ApiProperty()
  username: string;
  @ApiProperty()
  cover_picture: string;
  @ApiProperty()
  email;
  @ApiProperty()
  twitter_link;
  @ApiProperty()
  instagram_link;
  @ApiProperty()
  website_link;
  @ApiProperty()
  profile_picture;
}
