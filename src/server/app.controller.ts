import { Controller, Get } from '@nestjs/common';
import { Public } from './common/decorators/public.decorator.js';

@Public()
@Controller()
export class AppController {
  @Get()
  getInfo() {
    return { name: 'Accountex API', version: '0.1.0' };
  }

  @Get('health')
  getHealth() {
    return { status: 'ok', timestamp: new Date().toISOString() };
  }
}
