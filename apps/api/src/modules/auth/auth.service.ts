import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Credentials, OAuth2Client } from "google-auth-library";
import { CryptoService } from "../../common/crypto/crypto.service";
import { GOOGLE_SCOPES } from "./auth.constants";

export interface AuthenticatedUser {
  email: string;
  name?: string;
  picture?: string;
  /** Set de tokens de Google ya cifrado (listo para persistir en User.googleTokens). */
  encryptedTokens: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
  ) {}

  private createOAuthClient(): OAuth2Client {
    return new OAuth2Client({
      clientId: this.config.getOrThrow<string>("GOOGLE_CLIENT_ID"),
      clientSecret: this.config.getOrThrow<string>("GOOGLE_CLIENT_SECRET"),
      redirectUri: this.config.getOrThrow<string>("GOOGLE_REDIRECT_URI"),
    });
  }

  /** URL de consentimiento de Google a la que redirigimos al usuario. */
  getAuthorizationUrl(state: string): string {
    return this.createOAuthClient().generateAuthUrl({
      access_type: "offline", // necesario para recibir refresh_token
      prompt: "consent", // fuerza refresh_token (útil en desarrollo)
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state,
    });
  }

  /**
   * Intercambia el `code` del callback por tokens, valida el id_token,
   * cifra los tokens y devuelve el perfil del usuario autenticado.
   */
  async handleCallback(code: string): Promise<AuthenticatedUser> {
    const client = this.createOAuthClient();

    let tokens: Credentials;
    try {
      const response = await client.getToken(code);
      tokens = response.tokens;
    } catch (err) {
      this.logger.error("Fallo al intercambiar el code por tokens", err as Error);
      throw new UnauthorizedException("No se pudo completar la autenticación con Google");
    }

    if (!tokens.id_token) {
      throw new UnauthorizedException("Google no devolvió id_token");
    }

    const ticket = await client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.config.getOrThrow<string>("GOOGLE_CLIENT_ID"),
    });
    const payload = ticket.getPayload();
    if (!payload?.email) {
      throw new UnauthorizedException("No se pudo obtener el correo del perfil de Google");
    }

    const encryptedTokens = this.crypto.encryptJson(tokens);

    // TODO(persistencia): crear/actualizar User en Prisma con { email, name, googleTokens: encryptedTokens }
    //   una vez que la base de datos esté activa (docker compose up + prisma migrate).
    //   El siguiente paso del Sprint 1 (sesión JWT) tomará el userId de aquí.
    this.logger.log(`Autenticación exitosa para ${payload.email}`);

    return {
      email: payload.email,
      name: payload.name,
      picture: payload.picture,
      encryptedTokens,
    };
  }
}
