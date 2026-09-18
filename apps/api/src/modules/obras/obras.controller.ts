import { Controller, Get, UseGuards } from '@nestjs/common';
import { ObrasService } from './obras.service';
import { AuthGuard } from '../auth/auth.guard';

@Controller('obras')
@UseGuards(AuthGuard)
export class ObrasController {
  constructor(private readonly obrasService: ObrasService) {}

  @Get()
  findAll() {
    return this.obrasService.findAll();
  }
}
