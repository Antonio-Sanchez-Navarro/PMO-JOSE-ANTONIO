/**
 * Orígenes que admite el CORS de la API y del socket del tablero.
 *
 * `WEB_URL` es **el** frontend: a él redirige el login y él es el que vigila la
 * sonda de «frontend al día». `WEB_URL_EXTRA` es opcional y solo **amplía** el
 * CORS; existe para la migración a dominio propio, en la que durante unos días
 * el tablero se sirve a la vez desde `web.app` y desde `app.pmo-app.com`.
 *
 * **Una variable extra y no `WEB_URLS` separada por comas**, por dos motivos:
 * - `deploy.yml` despliega con `--set-env-vars`, que separa por comas: una
 *   lista dentro de un valor partiría la variable en dos.
 * - `WEB_URL` no cambia de significado. Todo lo que la lee sigue recibiendo un
 *   solo origen, y no hay que decidir cuál de una lista es «el» frontend.
 *
 * **Sin `WEB_URL_EXTRA` devuelve la misma cadena de siempre, no una lista de
 * uno.** No es igual para el paquete `cors`: con una cadena la manda tal cual
 * en `Access-Control-Allow-Origin`; con una lista solo la manda si el origen
 * de la petición está en ella. El navegador bloquea igual en los dos casos,
 * pero así, mientras no exista la variable, la cabecera es literalmente la de
 * hoy.
 */
export function origenesCors(
  webUrl: string | undefined,
  webUrlExtra: string | undefined,
): string | string[] {
  const principal = webUrl ?? 'http://localhost:5173';
  const extra = webUrlExtra?.trim();

  if (!extra || extra === principal) return principal;
  return [principal, extra];
}
