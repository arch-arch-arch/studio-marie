import { FORMATS, nouvelleFiche } from './fiche.js';
import { depuisSaisieLocale } from './dates.js';

export const SEUIL_CLASSEMENT = 0.8;
const RESULTATS = ['gagnant', 'perdant'];
const MAXIMUM = 20;

export function validerReference(liste) {
  if (!Array.isArray(liste)) return { ok: false, erreurs: ['Le jeu de référence doit être une liste JSON.'] };
  const erreurs = [];
  liste.forEach((item, i) => {
    const n = i + 1;
    if (!item || typeof item !== 'object' || Array.isArray(item)) { erreurs.push(`Élément ${n} : objet attendu.`); return; }
    if (!FORMATS.includes(item.format)) erreurs.push(`Élément ${n} : format inconnu.`);
    if (!RESULTATS.includes(item.resultat)) erreurs.push(`Élément ${n} : resultat doit valoir gagnant ou perdant.`);
    if (typeof item.accroche !== 'string' || !item.accroche.trim()) erreurs.push(`Élément ${n} : accroche manquante.`);
    const captionOk = item.caption === undefined || typeof item.caption === 'string';
    const pilierOk = item.pilier === undefined || typeof item.pilier === 'string';
    const hashtagsOk = item.hashtags === undefined || (Array.isArray(item.hashtags) && item.hashtags.every(h => typeof h === 'string'));
    if (!captionOk || !pilierOk || !hashtagsOk) erreurs.push(`Élément ${n} : caption, pilier et hashtags doivent être du texte.`);
  });
  if (!erreurs.length && (!liste.some(i => i.resultat === 'gagnant') || !liste.some(i => i.resultat === 'perdant'))) {
    erreurs.push('Il faut au moins un contenu gagnant et un contenu perdant.');
  }
  if (liste.length > MAXIMUM) erreurs.push(`${MAXIMUM} contenus au maximum (chaque vérification lance une évaluation par contenu).`);
  if (erreurs.length) return { ok: false, erreurs };
  return {
    ok: true,
    erreurs: [],
    items: liste.map((item, i) => ({
      id: `r${i + 1}`, format: item.format, pilier: item.pilier ?? '', accroche: item.accroche.trim(),
      caption: item.caption ?? '', hashtags: Array.isArray(item.hashtags) ? item.hashtags : [], resultat: item.resultat,
    })),
  };
}

export function ficheDeReference(item, regles) {
  const creneau = regles.creneaux[0];
  const jour = `2026-01-${String(4 + (creneau?.jours[0] ?? 1)).padStart(2, '0')}`;
  const date_heure = depuisSaisieLocale(jour, creneau?.debut ?? '12:00', regles.fuseau);
  return {
    ...nouvelleFiche({ id: `ref-${item.id}`, format: item.format, date_heure, pilier: item.pilier, maintenant: date_heure }),
    accroche: item.accroche, caption: item.caption, hashtags: item.hashtags,
  };
}

export function verifierClassement(resultats) {
  const gagnants = resultats.filter(r => r.resultat === 'gagnant');
  const perdants = resultats.filter(r => r.resultat === 'perdant');
  const inversions = [];
  let paires = 0;
  for (const g of gagnants) {
    for (const p of perdants) {
      paires++;
      if (g.total <= p.total) inversions.push({ gagnant: g.id, perdant: p.id });
    }
  }
  const taux = paires ? (paires - inversions.length) / paires : 0;
  return { taux, paires, ok: paires > 0 && taux >= SEUIL_CLASSEMENT, inversions };
}
