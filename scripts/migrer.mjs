import { readFileSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { validerExport, COLLECTIONS_EXPORT } from '../src/logique/sauvegarde.js';
import { TYPES_ACCEPTES, TAILLE_MAX } from '../src/socle/visuels-supabase.js';

const TYPES = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif', mp4: 'video/mp4', mov: 'video/quicktime', webm: 'video/webm' };
const LOT = 50;
const PAGE = 1000;
const MARQUEUR_VEILLE = 'veille_en_cours';

const sansExtension = nom => { const point = nom.lastIndexOf('.'); return point > 0 ? nom.slice(0, point) : null; };

// Lit le texte d'un export : retire un BOM UTF-8, message fixe si le JSON est illisible (aucun fragment du contenu).
export function lireExport(texte) {
  try {
    return JSON.parse(String(texte).replace(/^\uFEFF/, ''));
  } catch {
    throw new Error('Le fichier d’export n’est pas un JSON lisible.');
  }
}

// Identifiants de visuels référencés par les fiches, sans supposer que l'export est valide.
export function referencesVisuels(exportJson) {
  const fiches = exportJson?.collections?.fiches;
  if (!Array.isArray(fiches)) return new Set();
  return new Set(fiches.map(f => f?.data?.visuel).filter(id => typeof id === 'string' && id));
}

// Associe les fichiers d'un dossier aux identifiants référencés par les fiches.
// Le nom complet prime ; à défaut, le nom sans sa dernière extension. Le type vient de l'extension.
export function associerVisuels(nomsDeFichiers, idsReferences) {
  const associes = [];
  const ignores = [];
  const extensionsInconnues = [];
  const parId = new Map();
  for (const nom of nomsDeFichiers) {
    const point = nom.lastIndexOf('.');
    const type = point > 0 ? TYPES[nom.slice(point + 1).toLowerCase()] : undefined;
    if (!type) { extensionsInconnues.push(nom); continue; }
    const id = idsReferences.has(nom) ? nom : (idsReferences.has(sansExtension(nom)) ? sansExtension(nom) : null);
    if (id === null) { ignores.push(nom); continue; }
    if (parId.has(id)) throw new Error(`Visuel ${id} : plusieurs fichiers correspondent (${parId.get(id)}, ${nom}).`);
    parId.set(id, nom);
    associes.push({ id, nom, type });
  }
  return { associes, ignores, extensionsInconnues };
}

async function lireCible(supabase) {
  const presents = new Set();
  // Le plafond de lignes du projet (PostgREST « Max rows ») peut être sous PAGE : on avance de ce qui est reçu et on s'arrête sur une page vide.
  for (let debut = 0; ;) {
    const { data, error } = await supabase.from('documents').select('collection,id').order('collection').order('id').range(debut, debut + PAGE - 1);
    if (error) throw new Error(`Lecture de la cible impossible : ${error.message}`);
    for (const l of data) presents.add(`${l.collection}/${l.id}`);
    if (data.length === 0) return presents;
    debut += data.length;
  }
}

export async function migrer({ exportJson, visuels, supabase, journal = console.log, simuler = false, ecraser = false, extensionsInconnues = [], maintenant = new Date().toISOString() }) {
  const v = validerExport(exportJson);
  if (!v.ok) return { ok: false, erreurs: v.erreurs };
  for (const c of v.ignorees) journal(`Collection inconnue ignorée : ${c}`);

  const doublons = [];
  for (const c of COLLECTIONS_EXPORT) {
    const vus = new Set();
    for (const d of v.collections[c]) {
      if (vus.has(d.id)) doublons.push(`${c}/${d.id} : identifiant en double.`);
      vus.add(d.id);
    }
  }
  if (doublons.length) return { ok: false, erreurs: doublons };

  const references = referencesVisuels(exportJson);
  const parId = new Map();
  const erreurs = [];
  for (const x of visuels) {
    if (parId.has(x.id)) { if (!erreurs.includes(`Visuel ${x.id} : fourni en double.`)) erreurs.push(`Visuel ${x.id} : fourni en double.`); continue; }
    parId.set(x.id, x);
  }
  if (erreurs.length) return { ok: false, erreurs };
  const verifies = new Set();
  for (const f of v.collections.fiches) {
    const id = f.data.visuel;
    if (!id) continue;
    const x = parId.get(id);
    if (!x) {
      const nom = extensionsInconnues.find(n => n === id || sansExtension(n) === id);
      erreurs.push(nom ? `Visuel ${id} : extension non reconnue (${nom}).` : `Visuel manquant : ${id} (fiche ${f.id}).`);
      continue;
    }
    if (verifies.has(id)) continue;
    verifies.add(id);
    const type = x.contenu instanceof Blob ? x.contenu.type : '';
    if (!TYPES_ACCEPTES.includes(type)) erreurs.push(`Visuel ${id} : type non accepté (${type}).`);
    else if (x.contenu.size > TAILLE_MAX) erreurs.push(`Visuel ${id} : plus de 20 Mo.`);
  }
  if (erreurs.length) return { ok: false, erreurs };

  const aEnvoyer = visuels.filter(x => references.has(x.id));
  for (const x of visuels) if (!references.has(x.id)) journal(`Visuel non référencé, ignoré : ${x.id}`);

  const aMigrer = Object.fromEntries(COLLECTIONS_EXPORT.map(c => [c, v.collections[c]]));
  if (aMigrer.config.some(d => d.id === MARQUEUR_VEILLE)) {
    aMigrer.config = aMigrer.config.filter(d => d.id !== MARQUEUR_VEILLE);
    journal('Marqueur de veille ignoré.');
  }
  if (!aMigrer.profil.some(d => d.id === 'courant')) journal('Attention : l’export ne contient pas de profil.');
  const total = COLLECTIONS_EXPORT.reduce((t, c) => t + aMigrer[c].length, 0);

  let dejaPresents = null;
  if (supabase) {
    let presents;
    try {
      presents = await lireCible(supabase);
    } catch (e) {
      return { ok: false, erreurs: [e.message] };
    }
    dejaPresents = COLLECTIONS_EXPORT.reduce((t, c) => t + aMigrer[c].filter(d => presents.has(`${c}/${d.id}`)).length, 0);
    journal(`Déjà présents dans la cible : ${presents.size} document(s), dont ${dejaPresents} seraient remplacés.`);
    if (dejaPresents > 0 && !ecraser && !simuler) {
      return { ok: false, erreurs: [`La cible contient déjà ${dejaPresents} document(s) de cet export. Rien n’a été écrit. Relance avec --ecraser pour les remplacer.`] };
    }
  } else if (simuler) {
    journal('Cible non consultée.');
  }

  if (simuler) {
    for (const c of COLLECTIONS_EXPORT) if (aMigrer[c].length) journal(`${c} : ${aMigrer[c].length}`);
    return { ok: true, documents: total, visuels: aEnvoyer.length, simulation: true, dejaPresents };
  }

  let visuelsEcrits = 0;
  let documents = 0;
  const echec = message => ({
    ok: false,
    erreurs: [message, `Écrit avant l’échec : ${visuelsEcrits} visuel(s), ${documents} document(s). Relance la même commande avec --ecraser : elle est réexécutable.`],
  });
  for (const x of aEnvoyer) {
    const { error } = await supabase.storage.from('visuels').upload(x.id, x.contenu, { contentType: x.type, upsert: true });
    if (error) return echec(`Visuel ${x.id} : ${error.message}`);
    visuelsEcrits += 1;
  }
  for (const c of COLLECTIONS_EXPORT) {
    const lignes = aMigrer[c].map(d => ({ collection: c, id: d.id, data: d.data, maj_le: maintenant }));
    for (let i = 0; i < lignes.length; i += LOT) {
      const { error } = await supabase.from('documents').upsert(lignes.slice(i, i + LOT));
      if (error) return echec(`${c} : ${error.message}`);
      documents += Math.min(LOT, lignes.length - i);
    }
    if (lignes.length) journal(`${c} : ${lignes.length}`);
  }
  return { ok: true, documents, visuels: visuelsEcrits };
}

const USAGE = 'Usage : node --env-file=.env.local scripts/migrer.mjs --export <fichier.json> [--visuels <dossier>] [--simuler] [--ecraser]\nSUPABASE_URL et SUPABASE_SERVICE_ROLE_KEY doivent être définies (sauf avec --simuler).\n--ecraser autorise le remplacement des documents déjà présents dans la cible.';

// Analyse stricte de la ligne de commande : une faute de frappe ne doit jamais lancer une migration réelle.
export function lireArguments(args) {
  const options = { export: null, visuels: null, simuler: false, ecraser: false };
  for (let i = 0; i < args.length; i += 1) {
    const a = args[i];
    if (a === '--simuler') options.simuler = true;
    else if (a === '--ecraser') options.ecraser = true;
    else if (a === '--export' || a === '--visuels') {
      const valeur = args[i + 1];
      if (valeur === undefined || valeur.startsWith('--')) return { ok: false, erreur: `Valeur manquante pour ${a}.` };
      options[a.slice(2)] = valeur;
      i += 1;
    } else if (a.startsWith('--')) return { ok: false, erreur: `Option inconnue : ${a}.` };
    else return { ok: false, erreur: `Argument inattendu : ${a}.` };
  }
  return { ok: true, options };
}

function lanceDirectement() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]).toLowerCase() === realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return false;
  }
}

if (lanceDirectement()) {
  const lecture = lireArguments(process.argv.slice(2));
  const env = process.env;
  const cibleDefinie = Boolean(env.SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
  if (!lecture.ok) {
    console.error(`${lecture.erreur}\n${USAGE}`);
    process.exit(1);
  }
  const { export: fichier, visuels: dossier, simuler, ecraser } = lecture.options;
  if (!fichier || (!simuler && !cibleDefinie)) {
    console.error(USAGE);
    process.exit(1);
  }
  try {
    const exportJson = lireExport(readFileSync(fichier, 'utf8'));
    const noms = dossier ? readdirSync(dossier, { withFileTypes: true }).filter(e => e.isFile()).map(e => e.name) : [];
    const { associes, ignores, extensionsInconnues } = associerVisuels(noms, referencesVisuels(exportJson));
    for (const nom of ignores) console.log(`Visuel non référencé, ignoré : ${nom}`);
    for (const nom of extensionsInconnues) console.log(`Extension non reconnue, ignoré : ${nom}`);
    const visuels = associes.map(({ id, nom, type }) => ({ id, type, contenu: new Blob([readFileSync(path.join(dossier, nom))], { type }) }));
    let supabase = null;
    if (cibleDefinie) {
      console.log(`Cible : ${new URL(env.SUPABASE_URL).host}`);
      const { createClient } = await import('@supabase/supabase-js');
      supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
    }
    const r = await migrer({ exportJson, visuels, supabase, simuler, ecraser, extensionsInconnues });
    if (!r.ok) { console.error(r.erreurs.join('\n')); process.exit(1); }
    console.log(simuler
      ? `Simulation terminée, rien n’a été écrit : ${r.documents} document(s), ${r.visuels} visuel(s).`
      : `Migration terminée : ${r.documents} document(s), ${r.visuels} visuel(s).`);
  } catch (e) {
    console.error(`Échec : ${e.message}`);
    process.exit(1);
  }
}
