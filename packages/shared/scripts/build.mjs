// Build del paquete compartido: limpia `dist` y compila los dos formatos.
//
// Va en un script de Node y no encadenado en el `package.json` por dos motivos:
// el borrado de `dist` es cross-platform (nada de `rm -rf` ni `rmdir /s`), y un
// fallo de `tsc` corta el build con código distinto de cero en vez de dejar un
// `dist` a medias que el consumidor descubre como un error raro en el navegador.
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

const pkgRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const dist = join(pkgRoot, 'dist');
const tsc = createRequire(import.meta.url).resolve('typescript/bin/tsc');

const run = (project) => {
  process.stdout.write(`  tsc -p ${project}\n`);
  execFileSync(process.execPath, [tsc, '-p', join(pkgRoot, project)], { stdio: 'inherit' });
};

rmSync(dist, { recursive: true, force: true });

run('tsconfig.json'); // CommonJS + .d.ts → dist/cjs (lo consume la API)
run('tsconfig.esm.json'); // ES modules → dist/esm (lo consume Vite)

// Marca la carpeta ESM como tal. Sin esto, Node trataría `dist/esm/index.js`
// como CommonJS —lo hereda del `package.json` del paquete, que no es `module`—
// y un import desde Node fallaría aunque desde Vite funcione.
writeFileSync(join(dist, 'esm', 'package.json'), `${JSON.stringify({ type: 'module' }, null, 2)}\n`);

process.stdout.write('  dist/cjs + dist/esm listos\n');
