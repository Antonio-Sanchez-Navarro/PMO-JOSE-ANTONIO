import { Module } from '@nestjs/common';
import { ObrasController } from './obras.controller';
import { ObrasService } from './obras.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule],
  controllers: [ObrasController],
  providers: [ObrasService],
  exports: [ObrasService],
})
export class ObrasModule {}
