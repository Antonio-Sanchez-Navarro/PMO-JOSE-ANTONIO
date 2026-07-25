import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AiService } from './ai.service';
import { AiProcessor } from './ai.processor';

@Module({
  imports: [ConfigModule],
  providers: [AiService, AiProcessor],
  exports: [AiService],
})
export class AiModule {}
