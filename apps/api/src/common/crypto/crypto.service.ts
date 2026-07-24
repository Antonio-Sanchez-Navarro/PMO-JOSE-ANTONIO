import { Injectable } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Cifrado simétrico autenticado (AES-256-GCM) para proteger datos sensibles
 * en reposo — principalmente los tokens de OAuth de Google (ver ARCHITECTURE.md §7).
 *
 * Formato de salida: `base64(iv).base64(authTag).base64(ciphertext)`
 *  - iv: nonce aleatorio de 96 bits (recomendado para GCM)
 *  - authTag: etiqueta de autenticación de 128 bits (integridad)
 */
@Injectable()
export class CryptoService {
  private static readonly ALGORITHM = "aes-256-gcm";
  private static readonly IV_LENGTH = 12; // 96 bits
  private readonly key: Buffer;

  constructor(config: ConfigService) {
    const hexKey = config.get<string>("TOKEN_ENCRYPTION_KEY") ?? "";
    if (!/^[0-9a-fA-F]{64}$/.test(hexKey)) {
      throw new Error(
        "TOKEN_ENCRYPTION_KEY debe tener 64 caracteres hexadecimales (32 bytes). " +
          'Genera uno con: node -e "console.log(require(\'crypto\').randomBytes(32).toString(\'hex\'))"',
      );
    }
    this.key = Buffer.from(hexKey, "hex");
  }

  /** Cifra una cadena y devuelve el paquete `iv.tag.ciphertext` en base64. */
  encrypt(plaintext: string): string {
    const iv = randomBytes(CryptoService.IV_LENGTH);
    const cipher = createCipheriv(CryptoService.ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString("base64"),
      authTag.toString("base64"),
      ciphertext.toString("base64"),
    ].join(".");
  }

  /** Descifra un paquete producido por {@link encrypt}. Lanza si la integridad falla. */
  decrypt(payload: string): string {
    const [ivB64, tagB64, dataB64] = payload.split(".");
    if (!ivB64 || !tagB64 || !dataB64) {
      throw new Error("Formato de datos cifrados inválido");
    }
    const decipher = createDecipheriv(
      CryptoService.ALGORITHM,
      this.key,
      Buffer.from(ivB64, "base64"),
    );
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final(),
    ]).toString("utf8");
  }

  /** Cifra un objeto serializable (p.ej. el set de tokens de OAuth). */
  encryptJson(value: unknown): string {
    return this.encrypt(JSON.stringify(value));
  }

  /** Descifra y parsea un objeto cifrado con {@link encryptJson}. */
  decryptJson<T>(payload: string): T {
    return JSON.parse(this.decrypt(payload)) as T;
  }
}
