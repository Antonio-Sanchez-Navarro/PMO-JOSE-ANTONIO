import { Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { Credentials, OAuth2Client } from "google-auth-library";
import { CryptoService } from "../../common/crypto/crypto.service";
import { UsersService } from "../users/users.service";
import { GOOGLE_SCOPES } from "./auth.constants";

export interface AuthenticatedUser {
  id: string;
  email: string;
  name?: string;
  picture?: string;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly crypto: CryptoService,
    private readonly users: UsersService,
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
   * cifra los tokens, persiste el usuario y devuelve su perfil.
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

    const user = await this.users.upsertFromGoogle(
      { email: payload.email, name: payload.name, picture: payload.picture },
      this.crypto.encryptJson(tokens),
    );

    this.logger.log(`Autenticación exitosa para ${payload.email}`);

    return {
      id: user.id,
      email: user.email,
      name: user.name ?? undefined,
      picture: payload.picture,
    };
  }

  /**
   * Cliente de Google listo para llamar a las APIs en nombre del usuario.
   *
   * `google-auth-library` renueva el `access_token` con el `refresh_token`
   * cuando detecta que expiró; el evento `tokens` nos deja re-cifrar y
   * persistir el set actualizado para no perder la renovación.
   *
   * Lo usará el módulo Gmail en el Sprint 2.
   */
  async getAuthorizedClient(userId: string): Promise<OAuth2Client> {
    const credentials = await this.users.getGoogleCredentials(userId);
    if (!credentials?.refresh_token && !credentials?.access_token) {
      throw new UnauthorizedException(
        "El usuario no tiene credenciales de Google válidas: debe volver a autorizar",
      );
    }

    const client = this.createOAuthClient();
    client.setCredentials(credentials);

    client.on("tokens", (fresh) => {
      // Google no reenvía el refresh_token en cada renovación: hay que conservarlo.
      const merged: Credentials = {
        ...credentials,
        ...fresh,
        refresh_token: fresh.refresh_token ?? credentials.refresh_token,
      };
      this.users
        .saveGoogleCredentials(userId, merged)
        .catch((err) =>
          this.logger.error(`No se pudieron guardar los tokens renovados de ${userId}`, err),
        );
    });

    return client;
  }
}
