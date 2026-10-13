import { h } from './h.js';
import { LIBELLES_FORMAT, LIBELLES_STATUT, aReevaluer } from '../logique/fiche.js';
import { heureLocale } from '../logique/dates.js';
import { CATEGORIES, categorieAffichee } from '../logique/categories.js';

export const LIBELLES_ETAT = { vert: 'conforme à la cible', orange: 'à surveiller', rouge: 'hors cible' };

function cadenas() {
  const span = h('span', { 'aria-hidden': 'true' });
  span.innerHTML = '<svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="0" y="5" width="10" height="7" rx="1.5"/><path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  return span;
}

// Sans score, rien : la note ne s’affiche que pour une fiche évaluée.
export function badgeScore(f) {
  if (!f.score) return null;
  const bloquee = f.score.conformite?.etat === 'rouge';
  const perimee = aReevaluer(f);
  const titre = bloquee ? 'Conformité au rouge' : perimee ? 'À réévaluer' : 'Score';
  return h('span', { class: bloquee ? 'badge badge-bloque' : 'badge', title: titre },
    bloquee ? cadenas() : null,
    String(f.score.total),
    perimee ? h('span', { class: 'point', 'aria-label': 'à réévaluer' }) : null);
}

// Couleur de la catégorie choisie ; une proposition ou une fiche non rangée donne le gris neutre.
// Le neutre dépend de l'élément : gris de trait pour le bord d'une carte, texte secondaire pour un point du Mois.
export function couleurCategorie(f, categories = CATEGORIES, neutre = 'var(--trait)') {
  const { cle, etat } = categorieAffichee(f);
  if (etat !== 'choisie') return neutre;
  return categories.find(c => c.cle === cle)?.couleur ?? neutre;
}

// Le visuel (media) de la fiche, s’il existe, est en haut de la carte.
// Format et heure sur une ligne ; le statut est un point, son libellé est masqué visuellement et en infobulle.
export function carte(f, regles, actions, action = null, categories = CATEGORIES, media = null) {
  return h('article', {
    class: `carte statut-${f.statut}`, draggable: true, tabindex: '0', 'data-id': f.id,
    style: { '--categorie': couleurCategorie(f, categories) },
    ondragstart: e => e.dataTransfer?.setData('text/plain', f.id),
    onclick: () => actions.ouvrirFiche(f.id),
    onkeydown: e => { if (e.key === 'Enter') actions.ouvrirFiche(f.id); },
  },
  media ? h('div', { class: 'carte-visuel' }, media) : null,
  h('div', { class: 'carte-tete' },
    h('span', { class: 'format' }, LIBELLES_FORMAT[f.format]),
    ' · ',
    h('span', { class: 'heure' }, heureLocale(f.date_heure, regles.fuseau))),
  h('p', { class: 'carte-accroche' }, f.accroche || 'Sans accroche'),
  action?.retard ? h('p', { class: 'carte-action action-retard' }, action.libelle) : null,
  h('div', { class: 'carte-pied' },
    h('span', { class: `point-statut statut-${f.statut}`, title: LIBELLES_STATUT[f.statut] },
      h('span', { class: 'visuellement-masque' }, LIBELLES_STATUT[f.statut])),
    badgeScore(f)));
}

// Contrôle de la semaine : seules les pastilles orange et rouges sont montrées ; les vertes sont dans « Tout voir ».
export function bandeau(pastilles) {
  const alertes = pastilles.filter(p => p.etat !== 'vert');
  const vertes = pastilles.length - alertes.length;
  const pastille = p => h('li', { class: `pastille pastille-${p.etat}`, title: LIBELLES_ETAT[p.etat] },
    h('span', {}, p.libelle),
    h('span', { class: 'pastille-valeur' }, p.valeur),
    h('span', { class: 'visuellement-masque' }, ` : ${LIBELLES_ETAT[p.etat]}`));
  return h('div', { class: 'bandeau-zone' },
    h('p', { class: 'bandeau-resume' }, `${vertes} sur ${pastilles.length} au vert`),
    h('ul', { class: 'bandeau', 'aria-label': 'Contrôle de la semaine' }, alertes.map(pastille)),
    vertes > 0
      ? h('details', { class: 'bandeau-detail' }, h('summary', {}, 'Tout voir'), h('ul', { class: 'bandeau-complet' }, pastilles.map(pastille)))
      : null);
}
