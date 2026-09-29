import { readFileSync, writeFileSync, readdirSync, realpathSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { construireVeille } from '../src/logique/veille.js';
import { ajouterJours, debutSemaine, cleSemaineIso, partiesLocales } from '../src/logique/dates.js';
import { nouvelId } from '../src/logique/fiche.js';
import { fuseauValide } from '../src/logique/profil.js';

const USAGE = 'Usage : veille.mjs plage|doit-tourner|construire --profil <fichier> [--fiches <dossier> --entree <fichier> --sortie <fichier>] [--maintenant <iso>] [--forcer]';
const FENETRE_DEBUT = 18 * 60 + 30;
const FENETRE_FIN = 21 * 60 + 29;

function options(argv) {
  const o = {};
  for (let i = 1; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) continue;
    const cle = a.slice(2);
    if (cle === 'forcer') { o.forcer = true; continue; }
    o[cle] = argv[i + 1];
    i += 1;
  }
  return o;
}
const document = brut => brut?.data ?? brut;

export function executer(argv, { lireJson, listerJson, ecrireJson, maintenant }) {
  const commande = argv[0];
  const o = options(argv);
  const quand = o.maintenant ?? maintenant();
  try {
    if (!['plage', 'doit-tourner', 'construire'].includes(commande)) return { code: 1, sortie: USAGE };
    if (Number.isNaN(new Date(quand).getTime())) return { code: 1, sortie: 'Date --maintenant invalide.' };
    const profil = document(lireJson(o.profil));
    const fz = profil?.regles_studio?.fuseau;
    if (!fuseauValide(fz)) return { code: 1, sortie: 'Fuseau du profil absent ou invalide.' };
    if (commande === 'plage') {
      const debut = debutSemaine(ajouterJours(quand, 7, fz), fz);
      return { code: 0, sortie: JSON.stringify({ semaine: cleSemaineIso(debut, fz), debut, fin: ajouterJours(debut, 7, fz) }) };
    }
    if (commande === 'doit-tourner') {
      if (o.forcer) return { code: 0, sortie: 'oui' };
      const local = partiesLocales(quand, fz);
      const minutesJour = local.heure * 60 + local.minute;
      const fenetre = local.jourSemaine === 7 && minutesJour >= FENETRE_DEBUT && minutesJour <= FENETRE_FIN;
      const bonMoment = local.heure === 20;
      return { code: 0, sortie: fenetre && !bonMoment ? 'non' : 'oui' };
    }
    if (!o.fiches || !o.entree || !o.sortie) return { code: 1, sortie: 'Il manque --fiches, --entree ou --sortie.' };
    const fiches = listerJson(o.fiches).map(({ nom, contenu }) => ({ id: contenu?.id ?? nom.replace(/\.json$/, ''), ...document(contenu) }));
    const r = construireVeille({ profil, fiches, entree: lireJson(o.entree), maintenant: quand, idAleatoire: nouvelId });
    if (!r.ok) return { code: 1, sortie: r.erreurs.join('\n') };
    const remplacees = r.ecritures.filter(e => e.op === 'delete').length;
    const resume = `Bulletin ${r.cle} : ${r.fichesCreees.length} idée(s), ${remplacees} remplacée(s), statut ${r.bulletin.statut}.`;
    ecrireJson(o.sortie, { ecritures: r.ecritures, resume });
    return { code: 0, sortie: resume };
  } catch (e) {
    return { code: 1, sortie: `Erreur : ${e.message}` };
  }
}

function lanceDirectement() {
  try {
    return Boolean(process.argv[1]) && realpathSync(process.argv[1]).toLowerCase() === realpathSync(fileURLToPath(import.meta.url)).toLowerCase();
  } catch {
    return false;
  }
}

if (lanceDirectement()) {
  const r = executer(process.argv.slice(2), {
    lireJson: p => JSON.parse(readFileSync(p, 'utf8')),
    listerJson: dossier => {
      try {
        return readdirSync(dossier).filter(n => n.endsWith('.json')).map(nom => ({ nom, contenu: JSON.parse(readFileSync(path.join(dossier, nom), 'utf8')) }));
      } catch (e) {
        if (e.code === 'ENOENT') return [];
        throw e;
      }
    },
    ecrireJson: (p, v) => writeFileSync(p, JSON.stringify(v, null, 2)),
    maintenant: () => new Date().toISOString(),
  });
  if (r.code !== 0) console.error(r.sortie);
  else console.log(r.sortie);
  process.exit(r.code);
}
