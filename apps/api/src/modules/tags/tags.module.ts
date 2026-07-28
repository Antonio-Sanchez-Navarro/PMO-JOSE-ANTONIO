import { Module } from '@nestjs/common';
import { TagsController } from './tags.controller';
import { TagsService } from './tags.service';
import { AuthModule } from '../auth/auth.module';

@Module({
  // Sin `AuthModule` el `AuthGuard` del controlador no resuelve sus
  // dependencias y la aplicación no arranca.
  imports: [AuthModule],
  controllers: [TagsController],
  providers: [TagsService],
  exports: [TagsService],
})
export class TagsModule {}
