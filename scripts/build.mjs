import { build } from 'esbuild';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const racine = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export async function construire() {
  const resultat = await build({
    entryPoints: [path.join(racine, 'src/interface/main.js')],
    bundle: true,
    format: 'iife',
    write: false,
    minify: true,
    target: 'es2020',
  });
  const script = resultat.outputFiles[0].text.replace(/<\/script/gi, '<\\/script');
  const gabarit = await readFile(path.join(racine, 'src/interface/page.html'), 'utf8');
  const styles = await readFile(path.join(racine, 'src/interface/styles.css'), 'utf8');
  return gabarit.replace('/*STYLES*/', () => styles).replace('/*SCRIPT*/', () => script);
}

const lanceDirectement = process.argv[1]
  && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();

if (lanceDirectement) {
  const html = await construire();
  await mkdir(path.join(racine, 'dist'), { recursive: true });
  await writeFile(path.join(racine, 'dist/studio.html'), html);
  console.log(`dist/studio.html (${Math.round(html.length / 1024)} Ko)`);
}
