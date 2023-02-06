import { Controller, Get, Body, Post } from '@nestjs/common';
import { ApiTags, ApiProperty } from '@nestjs/swagger';
import { AppService } from './app.service';

class signatureDTO {
  @ApiProperty()
  privateKey: string;
}

class RecaptchaDTO {
  @ApiProperty()
  captchaToken: string;
}

@ApiTags('v1')
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  @Post('/signatureSimulation')
  async signatureSimulation(@Body() req: signatureDTO): Promise<any> {
    const { privateKey } = req;
    return await this.appService.sign(privateKey);
  }

  @Post('/recaptcha')
  async recaptcha(@Body() req: RecaptchaDTO) {
    const { captchaToken } = req;
    return await this.appService.recaptcha(captchaToken);
  }
}
