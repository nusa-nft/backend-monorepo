import { Body, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
  ApiOperation,
} from '@nestjs/swagger';
import { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import { ValidateDto } from './dto/validate.dto';
import { JwtAuthGuard } from './jwt-auth.guard';

@ApiTags('auth')
@ApiBearerAuth()
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly usersService: UsersService,
  ) {}

  @Post('login')
  @ApiOkResponse({ description: 'logged in to metamask' })
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  login(@Body() payload: ValidateDto): Promise<string> {
    return this.authService.validate(payload);
  }

  @UseGuards(JwtAuthGuard)
  @Get('profile')
  @ApiUnauthorizedResponse({ description: 'Unauthorized' })
  profile(@Req() req) {
    const { user } = req;
    return this.usersService.findOne(user.id);
  }

  @UseGuards(JwtAuthGuard)
  @ApiBearerAuth('jwt')
  @Get('get-public-mint-signature')
  @ApiOperation({ summary: 'Get signature required for public minting' })
  async getPublicMintSignature(@Req() req) {
    const { wallet_address } = req.user;
    return this.authService.getPublicMintSignature(wallet_address);
  }
}
