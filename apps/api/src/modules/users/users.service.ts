import { Injectable, Logger } from "@nestjs/common";
import type { User } from "@prisma/client";
import type { Credentials } from "google-auth-library";
import { PrismaService } from "../../common/prisma/prisma.service";
import { CryptoService } from "../../common/crypto/crypto.service";

export interface GoogleProfile {
  email: string;
  name?: string;
  picture?: string;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly crypto: CryptoService,
  ) {}

  findById(id: string): Promise<User | null> {
    return this.prisma.user.findUnique({ where: { id } });
  }

  /**
   * Crea o actualiza el usuario tras un login con Google.
   * Los tokens llegan ya cifrados (AES-256-GCM) desde `AuthService`.
   */
  async upsertFromGoogle(profile: GoogleProfile, encryptedTokens: string): Promise<User> {
    const user = await this.prisma.user.upsert({
      where: { email: profile.email },
      create: {
        email: profile.email,
        name: profile.name ?? null,
        googleTokens: encryptedTokens,
      },
      update: {
        name: profile.name ?? undefined,
        googleTokens: encryptedTokens,
      },
    });
    this.logger.log(`Usuario persistido: ${user.email} (${user.id})`);
    return user;
  }

  /** Devuelve las credenciales de Google descifradas, o `null` si no hay. */
  async getGoogleCredentials(userId: string): Promise<Credentials | null> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { googleTokens: true },
    });
    if (!user?.googleTokens) return null;

    try {
      return this.crypto.decryptJson<Credentials>(user.googleTokens);
    } catch (err) {
      // Suele indicar que TOKEN_ENCRYPTION_KEY cambió: el usuario debe volver a autorizar.
      this.logger.error(`No se pudieron descifrar los tokens de ${userId}`, err as Error);
      return null;
    }
  }

  /** Guarda credenciales de Google cifradas (p. ej. tras un refresh de access_token). */
  async saveGoogleCredentials(userId: string, credentials: Credentials): Promise<void> {
    await this.prisma.user.update({
      where: { id: userId },
      data: { googleTokens: this.crypto.encryptJson(credentials) },
    });
  }
}
