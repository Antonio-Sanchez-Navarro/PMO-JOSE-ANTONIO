import { Module } from "@nestjs/common";
import { UsersService } from "./users.service";

// CryptoModule y PrismaModule son globales: no hace falta importarlos aquí.
@Module({
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
