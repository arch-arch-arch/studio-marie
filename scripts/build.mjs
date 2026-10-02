import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function construire(env = process.env) {
  if (!env.SUPABASE_URL || !env.SUPABASE_ANON_KEY) throw new Error('SUPABASE_URL et SUPABASE_ANON_KEY sont requis pour construire la page.');
  const resultat = await build({
    entryPoints: [path.join(racine, 'src/interface/main.js')],
    bundle: true,
    format: 'iife',
    write: false,
    minify: true,
    target: 'es2020',
    external: ['/dossier.js'],
    define: { __SUPABASE_URL__: JSON.stringify(env.SUPABASE_URL), __SUPABASE_ANON_KEY__: JSON.stringify(env.SUPABASE_ANON_KEY) },
  });
  const script = resultat.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const gabarit = await readFile(path.join(racine, 'src/interface/page.html'), 'utf8');
  const styles = await readFile(path.join(racine, 'src/interface/styles.css'), 'utf8');
  return gabarit.replace('/*STYLES*/', () => styles).replace('/*SCRIPT*/', () => script);
}

export async function construireDossier() {
  const resultat = await build({
    entryPoints: [path.join(racine, 'src/dossier/fabrique.js')],
    bundle: true, format: 'esm', write: false, minify: true, target: 'es2020',
  });
  return resultat.outputFiles[0].text;
}

const lanceDirectement = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (lanceDirectement) {
  const html = await construire();
  await mkdir(path.join(racine, 'public'), { recursive: true });
  await writeFile(path.join(racine, 'public/index.html'), html);
  console.log(`public/index.html (${Math.round(html.length / 1024)} Ko)`);
  const dossier = await construireDossier();
  await writeFile(path.join(racine, 'public/dossier.js'), dossier);
  console.log(`public/dossier.js (${Math.round(dossier.length / 1024)} Ko)`);
}
