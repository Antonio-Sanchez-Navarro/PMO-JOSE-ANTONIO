import { Global, Module } from "@nestjs/common";
import { CryptoService } from "./crypto.service";

/**
 * Módulo global: expone CryptoService a toda la app sin re-importar.
 */
@Global()
@Module({
  providers: [CryptoService],
  exports: [CryptoService],
})
export class CryptoModule {}
