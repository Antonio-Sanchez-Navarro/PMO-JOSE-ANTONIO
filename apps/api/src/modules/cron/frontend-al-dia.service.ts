import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AlertService } from '../../common/alerts/alert.service';
import { describirError } from '../../common/observability/describir-error';

/**
 * Repositorio contra el que se comprueba la ascendencia.
 *
 * Va aquí y no en una variable de entorno porque **no es configuración de
 * despliegue**: es de qué repositorio habla este código. Una variable haría que
 * dos entornos pudieran comprobar contra repos distintos sin que se note.
 */
const REPO = 'Antonio-Sanchez-Navarro/PMO-JOSE-ANTONIO';

/**
 * Las rutas cuyo cambio obliga a que Vercel reconstruya.
 *
 * ⚠️ **Es el mismo criterio que usa el `ignoreCommand` de Vercel, y tiene que
 * seguir siéndolo.** Si aquí se mira una lista y allí otra, la sonda avisa de
 * despliegues que Vercel se salta a propósito — y una sonda que avisa de lo
 * normal se deja de mirar en una semana.
 */
const RUTAS_DEL_FRONTEND = ['apps/web', 'packages/shared'];

/**
 * Cuánto se le concede al frontend para ponerse al día antes de dar la alarma.
 *
 * Cubre tres cosas que suman: lo que tarda CI, lo que tarda el build de Vercel
 * y —la que no se ve leyendo el código— **la caché del CDN**. Medido el
 * 2026-08-24: `/version.json` responde con `Cache-Control: no-cache, no-store,
 * must-revalidate` y aun así llegó con `Age: 988`, o sea dieciséis minutos de
 * copia cacheada. El `no-store` no manda tanto como parece.
 *
 * ⚠️ **Si alguien baja este margen a cinco minutos, la sonda empieza a dar
 * falsos positivos** — no porque el frontend esté atrasado, sino porque el CDN
 * sirve una copia de hace un rato. Una hora deja sitio de sobra.
 */
const MARGEN_MS = 60 * 60_000;

/** Silencio entre avisos de «atrasado». Muy por encima de la cadencia del cron. */
const FRENO_ATRASADO_S = 6 * 3_600;

/**
 * Silencio entre avisos de «no puedo comprobarlo».
 *
 * Más largo que el de «atrasado» a propósito: no saber es menos urgente que
 * saber que está mal, pero **no es lo mismo que estar bien** y por eso avisa.
 * Una sonda que se queda muda cuando no puede mirar es una sonda apagada con
 * apariencia de encendida, que es el fallo que este proyecto lleva un mes
 * persiguiendo.
 */
const FRENO_INDETERMINADO_S = 12 * 3_600;

const TIMEOUT_MS = 15_000;

export type EstadoFrontend = 'al-dia' | 'atrasado' | 'indeterminado';

export interface ResultadoFrontend {
  estado: EstadoFrontend;
  /** Commit que está sirviendo producción, según `/version.json`. */
  servido?: string;
  /** Último commit que tocó el frontend. Es la referencia a alcanzar. */
  referencia?: string;
  motivo?: string;
}

/**
 * ¿Está producción sirviendo el frontend que le toca?
 *
 * **Es la Capa 2 del despliegue**, y existe por lo que la Capa 1 no puede ver:
 * los avisos por evento (`deployment_status`, `workflow_run`) solo cuentan lo
 * que **llega a fallar**. Si Vercel deja de publicar su estado, si alguien
 * desconecta la integración, si el build ni se lanza — no hay evento, no hay
 * aviso, y el silencio es indistinguible de que todo vaya bien. Esto **pregunta**
 * en vez de esperar a que le cuenten.
 *
 * Misma estructura que la alerta de ausencia del respaldo, y por el mismo motivo.
 */
@Injectable()
export class FrontendAlDiaService {
  private readonly logger = new Logger(FrontendAlDiaService.name);

  constructor(
    private readonly config: ConfigService,
    private readonly alertas: AlertService,
  ) {}

  async comprobar(): Promise<ResultadoFrontend> {
    const resultado = await this.evaluar();

    this.logger.log(
      `Frontend ${resultado.estado}` +
        (resultado.servido ? ` · sirve ${resultado.servido.slice(0, 7)}` : '') +
        (resultado.referencia ? ` · referencia ${resultado.referencia.slice(0, 7)}` : '') +
        (resultado.motivo ? ` · ${resultado.motivo}` : ''),
    );

    if (resultado.estado === 'atrasado') {
      await this.alertas.avisar(
        'El frontend de producción está atrasado',
        `Producción sirve ${resultado.servido?.slice(0, 7)} y no contiene ` +
          `${resultado.referencia?.slice(0, 7)}, que es el ultimo commit que toco ` +
          `${RUTAS_DEL_FRONTEND.join(' o ')} hace mas de una hora. Mira los despliegues de ` +
          'Vercel: puede que ninguno se haya lanzado, que es lo que la Capa 1 no ve.',
        'frontend-atrasado',
        FRENO_ATRASADO_S,
      );
    }

    if (resultado.estado === 'indeterminado') {
      await this.alertas.avisar(
        'No se puede comprobar si el frontend esta al dia',
        `${resultado.motivo}. Ojo: esto NO significa que este roto, significa que la ` +
          'sonda no ha podido mirar. Mientras siga asi, nadie esta vigilando que ' +
          'produccion sirva el frontend que le toca.',
        'frontend-indeterminado',
        FRENO_INDETERMINADO_S,
      );
    }

    return resultado;
  }

  private async evaluar(): Promise<ResultadoFrontend> {
    const web = this.config.get<string>('WEB_URL')?.replace(/\/+$/, '');
    if (!web) {
      return { estado: 'indeterminado', motivo: 'WEB_URL no esta configurada' };
    }

    let servido: string;
    try {
      const res = await fetch(`${web}/version.json`, {
        // El CDN sirve copia cacheada aunque el recurso diga `no-store`, asi que
        // se pide sin cache tambien desde aqui. No lo elimina -de ahi el margen-
        // pero reduce la ventana.
        cache: 'no-store',
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) {
        return { estado: 'indeterminado', motivo: `/version.json respondio ${res.status}` };
      }
      servido = ((await res.json()) as { commit?: string }).commit ?? '';
      if (!servido) {
        return { estado: 'indeterminado', motivo: '/version.json no trae `commit`' };
      }
    } catch (err) {
      return { estado: 'indeterminado', motivo: `no se pudo leer /version.json: ${describirError(err)}` };
    }

    const referencia = await this.ultimoCommitDelFrontend();
    if (!referencia) {
      return {
        estado: 'indeterminado',
        servido,
        motivo: 'no se pudo saber cual fue el ultimo commit del frontend',
      };
    }

    // Recién commiteado: CI, build y CDN todavía tienen su plazo. Preguntar
    // ahora sería avisar de algo que está en camino.
    if (Date.now() - referencia.fecha < MARGEN_MS) {
      return {
        estado: 'al-dia',
        servido,
        referencia: referencia.sha,
        motivo: 'el ultimo cambio del frontend es reciente, aun tiene margen',
      };
    }

    return this.compararAscendencia(referencia.sha, servido);
  }

  /**
   * ¿El commit servido **contiene** al último del frontend?
   *
   * ⚠️ **Ancestría, no igualdad, y esto no se ve leyendo el código.** Vercel
   * etiqueta el build con el commit que lo **disparó**, que en este árbol suele
   * ser el de otro agente — una bitácora, un `.md`— porque tres capas escriben
   * sobre el mismo `master`. Medido el 2026-08-24: producción servía `f634efa`
   * (una bitácora) mientras el último commit del frontend era `d2ae401`, **y
   * estaba al día**, porque `d2ae401` va dentro de `f634efa`.
   *
   * Una sonda con `==` habría gritado desde el primer minuto y en dos semanas
   * nadie la miraría. Es el mismo error del `ignoreCommand`: comparar contra la
   * cabeza de `master` en vez de contra lo que de verdad obliga a reconstruir.
   *
   * Se resuelve con la API de GitHub y no con `git`, porque **aquí no hay
   * repositorio**: esto corre en Cloud Run, no en un runner. De paso evita el
   * problema del clon superficial, donde `merge-base --is-ancestor` falla si el
   * commit no está en el clon.
   */
  private async compararAscendencia(referencia: string, servido: string): Promise<ResultadoFrontend> {
    try {
      const res = await fetch(`https://api.github.com/repos/${REPO}/compare/${referencia}...${servido}`, {
        headers: { accept: 'application/vnd.github+json' },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });

      if (!res.ok) {
        return {
          estado: 'indeterminado',
          servido,
          referencia,
          motivo: `GitHub respondio ${res.status} al comparar los commits`,
        };
      }

      // `ahead`: el servido va por delante de la referencia, luego la contiene.
      // `identical`: son el mismo. Las dos son "al dia".
      // `behind` y `diverged` significan que la referencia NO esta dentro.
      const estado = (await res.json()) as { status?: string };
      const alDia = estado.status === 'ahead' || estado.status === 'identical';

      return {
        estado: alDia ? 'al-dia' : 'atrasado',
        servido,
        referencia,
        motivo: `comparacion: ${estado.status ?? 'sin estado'}`,
      };
    } catch (err) {
      return {
        estado: 'indeterminado',
        servido,
        referencia,
        motivo: `no se pudo comparar con GitHub: ${describirError(err)}`,
      };
    }
  }

  /** El más reciente de los commits que tocaron alguna ruta del frontend. */
  private async ultimoCommitDelFrontend(): Promise<{ sha: string; fecha: number } | null> {
    const candidatos: { sha: string; fecha: number }[] = [];

    for (const ruta of RUTAS_DEL_FRONTEND) {
      try {
        const res = await fetch(
          `https://api.github.com/repos/${REPO}/commits?sha=master&path=${ruta}&per_page=1`,
          { headers: { accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(TIMEOUT_MS) },
        );
        if (!res.ok) continue;

        const [commit] = (await res.json()) as {
          sha?: string;
          commit?: { committer?: { date?: string } };
        }[];
        const fecha = Date.parse(commit?.commit?.committer?.date ?? '');
        if (commit?.sha && !Number.isNaN(fecha)) candidatos.push({ sha: commit.sha, fecha });
      } catch (err) {
        this.logger.warn(`No se pudo consultar los commits de ${ruta}: ${describirError(err)}`);
      }
    }

    if (candidatos.length === 0) return null;
    return candidatos.reduce((a, b) => (b.fecha > a.fecha ? b : a));
  }
}
