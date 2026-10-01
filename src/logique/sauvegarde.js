import { cleJour } from './dates.js';
import { validerProfil } from './profil.js';

export const COLLECTIONS_EXPORT = ['profil', 'profil_archives', 'fiches', 'bulletins', 'stats_contenu', 'releves_compte', 'reference', 'reference_resultats', 'config'];
const FORMAT = 'studio-contenu-export';
const VERSION = 1;
const NOTE = 'Les visuels ne sont pas inclus : seuls leurs identifiants le sont.';

export function construireExport(collections, maintenant) {
  return {
    format: FORMAT, version: VERSION, exporte_le: maintenant, note: NOTE,
    collections: Object.fromEntries(COLLECTIONS_EXPORT.map(c => [c, collections[c] ?? []])),
  };
}

export const nomFichierExport = (maintenant, fuseau) => `studio-contenu-${cleJour(maintenant, fuseau || 'UTC')}.json`;

const estObjet = v => v != null && typeof v === 'object' && !Array.isArray(v);
const idInvalide = d => typeof d.id !== 'string' || !d.id || d.id.includes('/') || /^\.\.?$|^__.*__$/.test(d.id);

export function validerExport(e) {
  if (!estObjet(e) || e.format !== FORMAT) return { ok: false, erreurs: ['Ce fichier n’est pas un export du studio.'] };
  if (e.version !== VERSION) return { ok: false, erreurs: [`Version d’export non prise en charge : ${e.version}.`] };
  if (!estObjet(e.collections)) return { ok: false, erreurs: ['Le fichier ne contient pas de collections.'] };
  const erreurs = [];
  const collections = {};
  for (const c of COLLECTIONS_EXPORT) {
    const liste = e.collections[c] ?? [];
    if (!Array.isArray(liste)) { erreurs.push(`${c} : liste de documents attendue.`); continue; }
    liste.forEach((d, i) => {
      if (!estObjet(d) || !estObjet(d.data)) {
        if (estObjet(d) && idInvalide(d)) erreurs.push(`${c}, document ${i + 1} : identifiant invalide.`);
        else erreurs.push(`${c}, document ${i + 1} : contenu invalide.`);
        return;
      }
      if (idInvalide(d)) erreurs.push(`${c}, document ${i + 1} : identifiant invalide.`);
    });
    collections[c] = liste;
  }
  const courant = collections.profil?.find(d => d.id === 'courant');
  if (courant && !erreurs.length) {
    const vp = validerProfil(courant.data);
    if (!vp.ok) erreurs.push(...vp.erreurs.map(m => `profil/courant : ${m}`));
    if (!Number.isInteger(courant.data.version) || courant.data.version < 1) erreurs.push('profil/courant : version manquante ou invalide.');
  }
  if (erreurs.length) return { ok: false, erreurs };
  const total = COLLECTIONS_EXPORT.reduce((t, c) => t + collections[c].length, 0);
  const ignorees = Object.keys(e.collections).filter(c => !COLLECTIONS_EXPORT.includes(c));
  return { ok: true, collections, total, ignorees };
}

const LIBELLES_COLLECTIONS = {
  profil: 'profil', profil_archives: 'archives de profil', fiches: 'fiches', bulletins: 'bulletins',
  stats_contenu: 'relevés de contenu', releves_compte: 'relevés du compte', reference: 'jeu de référence',
  reference_resultats: 'bilan de référence', config: 'réglages',
};

export function resumeRestauration({ collections, total, ignorees }) {
  const parties = COLLECTIONS_EXPORT.filter(c => collections[c].length).map(c => `${LIBELLES_COLLECTIONS[c] ?? c} : ${collections[c].length}`);
  const base = `À restaurer : ${parties.join(', ') || 'rien'} (total ${total} document${total > 1 ? 's' : ''}). Les documents de même identifiant seront remplacés ; rien ne sera supprimé.`;
  return ignorees.length ? `${base} Collections inconnues ignorées : ${ignorees.join(', ')}.` : base;
}
