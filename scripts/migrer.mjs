import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validerExport, COLLECTIONS_EXPORT } from '../src/logique/sauvegarde.js';
import { TYPES_ACCEPTES } from '../src/socle/visuels-supabase.js';

const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
const LOT = 200;
const MARQUEUR_VEILLE = 'veille_en_cours';

// Associe les fichiers d'un dossier aux identifiants référencés par les fiches.
// Le nom complet prime ; à défaut, le nom sans sa dernière extension. Le type vient de l'extension.
export function associerVisuels(nomsDeFichiers, idsReferences) {
  const associes = [];
  const ignores = [];
  const parId = new Map();
  for (const nom of nomsDeFichiers) {
    const point = nom.lastIndexOf('.');
    const type = point > 0 ? TYPES[nom.slice(point + 1).toLowerCase()] : undefined;
    const id = idsReferences.has(nom) ? nom : (point > 0 && idsReferences.has(nom.slice(0, point)) ? nom.slice(0, point) : null);
    if (!type || id === null) { ignores.push(nom); continue; }
    if (parId.has(id)) throw new Error(`Visuel ${id} : plusieurs fichiers correspondent (${parId.get(id)}, ${nom}).`);
    parId.set(id, nom);
    associes.push({ id, nom, type });
  }
  return { associes, ignores };
}

export async function migrer({ exportJson, visuels, supabase, journal = console.log, simuler = false, maintenant = new Date().toISOString() }) {
  const v = validerExport(exportJson);
  if (!v.ok) return { ok: false, erreurs: v.erreurs };
  const parId = new Map(visuels.map(x => [x.id, x]));
  const erreurs = [];
  for (const f of v.collections.fiches) {
    const id = f.data.visuel;
    if (!id) continue;
    const x = parId.get(id);
    if (!x) { erreurs.push(`Visuel manquant : ${id} (fiche ${f.id}).`); continue; }
    const type = x.contenu instanceof Blob ? x.contenu.type : '';
    if (!TYPES_ACCEPTES.includes(type)) erreurs.push(`Visuel ${id} : type non accepté (${type}).`);
  }
  if (erreurs.length) return { ok: false, erreurs };

  const aMigrer = Object.fromEntries(COLLECTIONS_EXPORT.map(c => [c, v.collections[c]]));
  if (aMigrer.config.some(d => d.id === MARQUEUR_VEILLE)) {
    aMigrer.config = aMigrer.config.filter(d => d.id !== MARQUEUR_VEILLE);
    journal('Marqueur de veille ignoré.');
  }
  const total = COLLECTIONS_EXPORT.reduce((t, c) => t + aMigrer[c].length, 0);

  if (simuler) {
    for (const c of COLLECTIONS_EXPORT) if (aMigrer[c].length) journal(`${c} : ${aMigrer[c].length}`);
    return { ok: true, documents: total, visuels: visuels.length, simulation: true };
  }

  for (const x of visuels) {
    const { error } = await supabase.storage.from('visuels').upload(x.id, x.contenu, { contentType: x.type, upsert: true });
    if (error) return { ok: false, erreurs: [`Visuel ${x.id} : ${error.message}`] };
  }
  let documents = 0;
  for (const c of COLLECTIONS_EXPORT) {
    const lignes = aMigrer[c].map(d => ({ collection: c, id: d.id, data: d.data, maj_le: maintenant }));
    for (let i = 0; i < lignes.length; i += LOT) {
      const { error } = await supabase.from('documents').upsert(lignes.slice(i, i + LOT));
      if (error) return { ok: false, erreurs: [`${c} : ${error.message}`] };
      documents += Math.min(LOT, lignes.length - i);
    }
    if (lignes.length) journal(`${c} : ${lignes.length}`);
  }
  return { ok: true, documents, visuels: visuels.length };
}

function lanceDirectement() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]).toLowerCase() === realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return false;
  }
}

if (lanceDirectement()) {
  const args = process.argv.slice(2);
  const option = nom => { const i = args.indexOf(`--${nom}`); return i >= 0 ? args[i + 1] : null; };
  const simuler = args.includes('--simuler');
  const fichier = option('export');
  const dossier = option('visuels');
  if (!fichier || (!simuler && (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY))) {
    console.error('Usage : node --env-file=.env.local scripts/migrer.mjs --export <fichier.json> [--visuels <dossier>] [--simuler]\nSUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies (sauf avec --simuler).');
    process.exit(1);
  }
  try {
    const exportJson = JSON.parse(readFileSync(fichier, 'utf8'));
    const references = new Set(((exportJson?.collections?.fiches) ?? []).map(f => f?.data?.visuel).filter(Boolean));
    const noms = dossier ? readdirSync(dossier, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name) : [];
    const { associes, ignores } = associerVisuels(noms, references);
    for (const nom of ignores) console.log(`Visuel non référencé, ignoré : ${nom}`);
    const visuels = associes.map(({ id, nom, type }) => ({ id, type, contenu: new Blob([readFileSync(path.join(dossier, nom))], { type }) }));
    let supabase = null;
    if (process.env.SUPABASE_URL) console.log(`Cible : ${new URL(process.env.SUPABASE_URL).host}`);
    if (!simuler) {
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    }
    const r = await migrer({ exportJson, visuels, supabase, simuler });
    if (!r.ok) { console.error(r.erreurs.join('\n')); process.exit(1); }
    console.log(simuler
      ? `Simulation terminée, rien n’a été écrit : ${r.documents} document(s), ${r.visuels} visuel(s).`
      : `Migration terminée : ${r.documents} document(s), ${r.visuels} visuel(s).`);
  } catch (e) {
    console.error(`Échec : ${e.message}`);
    process.exit(1);
  }
}
