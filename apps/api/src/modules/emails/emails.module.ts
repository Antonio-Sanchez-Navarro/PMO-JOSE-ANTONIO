import { Module } from '@nestjs/common';
import { EmailsController } from './emails.controller';
import { EmailsService } from './emails.service';
import { AiModule } from '../ai/ai.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [AuthModule, AiModule],
  controllers: [EmailsController],
  providers: [EmailsService],
})
export class EmailsModule {}
