import { partiesLocales, versUtc } from './dates.js';

export const FORMATS = ['reel', 'carrousel', 'story', 'post'];
export const LIBELLES_FORMAT = { reel: 'Reel', carrousel: 'Carrousel', story: 'Story', post: 'Post' };
export const STATUTS = ['idee', 'brouillon', 'valide', 'programme', 'publie'];
export const LIBELLES_STATUT = { idee: 'Idée', brouillon: 'Brouillon', valide: 'Validé', programme: 'Programmé', publie: 'Publié' };
const EXIGE_EVALUATION = new Set(['valide', 'programme', 'publie']);

export function nouvelId() {
  return `f-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

export function nouvelleFiche({ id, format, date_heure, pilier = '', maintenant, origine = { type: 'manuelle' } }) {
  if (!FORMATS.includes(format)) throw new Error(`Format inconnu : ${format}`);
  return {
    id, format, pilier, format_valide: '', role_caption: null, cta: false, ragebait: false, porte: false,
    date_heure, statut: 'idee', visuel: null, visuel_type: null, accroche: '', caption: '', variantes: [],
    hashtags: [], geotag: '', score: null, recommandations: [], origine,
    modifiee_depuis_creation: false, cree_le: maintenant, maj_le: maintenant,
  };
}

export function empreinte(f) {
  const texte = [
    f.accroche ?? '', f.caption ?? '', f.visuel ?? '', (f.hashtags ?? []).join(' '),
    f.format ?? '', f.pilier ?? '', f.role_caption ?? '', f.cta ? '1' : '0',
  ].join('␞');
  let h = 0x811c9dc5;
  for (let i = 0; i < texte.length; i++) {
    h ^= texte.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, '0');
}

export const aReevaluer = f => !!f.score && f.score.empreinte !== empreinte(f);

const CHAMPS_PROTEGES = ['statut', 'id', 'cree_le', 'score'];

export function modifierFiche(fiche, changements, maintenant) {
  for (const cle of CHAMPS_PROTEGES) {
    if (Object.prototype.hasOwnProperty.call(changements, cle)) {
      throw new Error(`Champ protégé : ${cle}`);
    }
  }
  const resultat = { ...fiche, ...changements, modifiee_depuis_creation: true, maj_le: maintenant };
  if ((resultat.statut === 'valide' || resultat.statut === 'programme') && aReevaluer(resultat)) {
    resultat.statut = 'brouillon';
  }
  return resultat;
}

export function peutPasserA(f, cible) {
  if (!STATUTS.includes(cible)) return { ok: false, raison: `Statut inconnu : ${cible}` };
  if (!EXIGE_EVALUATION.has(cible)) return { ok: true };
  if (!f.visuel) return { ok: false, raison: 'Ajoute un visuel avant de valider.' };
  if (f.format !== 'story' && !f.caption?.trim()) return { ok: false, raison: 'Ajoute une caption avant de valider.' };
  if (!f.score) return { ok: false, raison: 'Évalue la fiche avant de la valider.' };
  if (f.score.conformite?.etat === 'rouge') {
    const causes = (f.score.conformite.causes ?? []).join(' ; ') || 'cause non précisée';
    return { ok: false, raison: `Conformité au rouge : ${causes}.` };
  }
  const etat = f.score.conformite?.etat;
  if (etat !== 'vert' && etat !== 'orange') {
    return { ok: false, raison: 'Conformité non évaluée : réévalue la fiche.' };
  }
  if (aReevaluer(f)) return { ok: false, raison: 'La fiche a changé depuis son évaluation : réévalue-la.' };
  return { ok: true };
}

export function changerStatut(fiche, cible, maintenant) {
  const v = peutPasserA(fiche, cible);
  if (!v.ok) throw new Error(v.raison);
  return { ...fiche, statut: cible, maj_le: maintenant };
}

export function deplacerFiche(fiche, jourIso, fuseau, maintenant) {
  const h = partiesLocales(fiche.date_heure, fuseau);
  const j = partiesLocales(jourIso, fuseau);
  const date_heure = versUtc({ annee: j.annee, mois: j.mois, jour: j.jour, heure: h.heure, minute: h.minute }, fuseau);
  return modifierFiche(fiche, { date_heure }, maintenant);
}

export function analyserHashtags(texte) {
  const vus = new Set();
  const tags = [];
  for (const brut of (texte ?? '').split(/[\s,;]+/)) {
    const tag = brut.replace(/^#+/, '').trim();
    if (!tag || vus.has(tag.toLowerCase())) continue;
    vus.add(tag.toLowerCase());
    tags.push(tag);
  }
  return tags;
}

export const formaterHashtags = tags => (tags ?? []).map(t => `#${t}`).join(' ');

export const texteAPublier = f => [f.caption?.trim(), formaterHashtags(f.hashtags)].filter(Boolean).join('\n\n');

export function appliquerEvaluation(fiche, { score, variantes, suggestions, recommandations }, maintenant) {
  const resultat = { ...fiche, score, variantes, suggestions, recommandations, maj_le: maintenant };
  if ((resultat.statut === 'valide' || resultat.statut === 'programme') && !peutPasserA(resultat, resultat.statut).ok) {
    resultat.statut = 'brouillon';
  }
  return resultat;
}
