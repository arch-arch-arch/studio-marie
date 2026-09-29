import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { construireVeille } from '../src/logique/veille.js';
import { ajouterJours, debutSemaine, cleSemaineIso, partiesLocales } from '../src/logique/dates.js';
import { nouvelId } from '../src/logique/fiche.js';

const USAGE = 'Usage : veille.mjs plage|doit-tourner|construire --profil <fichier> [--fiches <dossier> --entree <fichier> --sortie <fichier>] [--maintenant <iso>]';

function options(argv) {
  const o = {};
  for (let i = 1; i < argv.length; i += 2) o[argv[i].replace(/^--/, '')] = argv[i + 1];
  return o;
}
const document = brut => brut?.data ?? brut;

export function executer(argv, { lireJson, listerJson, ecrireJson, maintenant }) {
  const commande = argv[0];
  const o = options(argv);
  const quand = o.maintenant ?? maintenant();
  try {
    if (!['plage', 'doit-tourner', 'construire'].includes(commande)) return { code: 1, sortie: USAGE };
    const profil = document(lireJson(o.profil));
    const fz = profil.regles_studio.fuseau;
    if (commande === 'plage') {
      const debut = debutSemaine(ajouterJours(quand, 7, fz), fz);
      return { code: 0, sortie: JSON.stringify({ semaine: cleSemaineIso(debut, fz), debut, fin: ajouterJours(debut, 7, fz) }) };
    }
    if (commande === 'doit-tourner') {
      const d = new Date(quand);
      const programme = d.getUTCDay() === 1 && d.getUTCHours() <= 1;
      const local = partiesLocales(quand, fz);
      const bonMoment = local.jourSemaine === 7 && local.heure === 20;
      return { code: 0, sortie: programme && !bonMoment ? 'non' : 'oui' };
    }
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

const lanceDirectement = process.argv[1] && path.resolve(process.argv[1]).toLowerCase() === fileURLToPath(import.meta.url).toLowerCase();
if (lanceDirectement) {
  const r = executer(process.argv.slice(2), {
    lireJson: p => JSON.parse(readFileSync(p, 'utf8')),
    listerJson: dossier => {
      try {
        return readdirSync(dossier).filter(n => n.endsWith('.json')).map(nom => ({ nom, contenu: JSON.parse(readFileSync(path.join(dossier, nom), 'utf8')) }));
      } catch {
        return [];
      }
    },
    ecrireJson: (p, v) => writeFileSync(p, JSON.stringify(v, null, 2)),
    maintenant: () => new Date().toISOString(),
  });
  console.log(r.sortie);
  process.exit(r.code);
}
