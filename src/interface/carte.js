import { h } from './h.js';
import { LIBELLES_FORMAT, LIBELLES_STATUT, aReevaluer } from '../logique/fiche.js';
import { heureLocale } from '../logique/dates.js';
import { ACTIONS_SANS_SUITE } from '../logique/parcours.js';

const LIBELLES_ETAT = { vert: 'conforme à la cible', orange: 'à surveiller', rouge: 'hors cible' };

function cadenas() {
  const span = h('span', { 'aria-hidden': 'true' });
  span.innerHTML = '<svg width="10" height="12" viewBox="0 0 10 12" fill="currentColor"><rect x="0" y="5" width="10" height="7" rx="1.5"/><path d="M2.5 5V3.5a2.5 2.5 0 0 1 5 0V5" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>';
  return span;
}

export function badgeScore(f) {
  if (!f.score) return h('span', { class: 'badge', title: 'Pas encore évaluée' }, '—');
  const bloquee = f.score.conformite?.etat === 'rouge';
  const perimee = aReevaluer(f);
  const titre = bloquee ? 'Conformité au rouge' : perimee ? 'À réévaluer' : 'Score';
  return h('span', { class: bloquee ? 'badge badge-bloque' : 'badge', title: titre },
    bloquee ? cadenas() : null,
    String(f.score.total),
    perimee ? h('span', { class: 'point', 'aria-label': 'à réévaluer' }) : null);
}

export function carte(f, regles, actions, action = null) {
  const pilier = regles.piliers.find(p => p.cle === f.pilier);
  return h('article', {
    class: `carte statut-${f.statut}`, draggable: true, tabindex: '0', 'data-id': f.id,
    style: { '--pilier': pilier?.couleur ?? 'var(--trait)' },
    ondragstart: e => e.dataTransfer?.setData('text/plain', f.id),
    onclick: () => actions.ouvrirFiche(f.id),
    onkeydown: e => { if (e.key === 'Enter') actions.ouvrirFiche(f.id); },
  },
  h('div', { class: 'carte-tete' },
    h('span', { class: 'format' }, LIBELLES_FORMAT[f.format]),
    h('span', { class: 'heure' }, heureLocale(f.date_heure, regles.fuseau))),
  h('p', { class: 'carte-accroche' }, f.accroche || 'Sans accroche'),
  action ? h('p', {
    class: ['carte-action', action.retard ? 'action-retard' : '', ACTIONS_SANS_SUITE.has(action.cle) ? 'action-calme' : ''].filter(Boolean).join(' '),
  }, action.libelle) : null,
  h('div', { class: 'carte-pied' },
    h('span', {}, LIBELLES_STATUT[f.statut]),
    badgeScore(f)));
}

export function bandeau(pastilles) {
  return h('ul', { class: 'bandeau', 'aria-label': 'Contrôle de la semaine' },
    pastilles.map(p => h('li', { class: `pastille pastille-${p.etat}`, title: LIBELLES_ETAT[p.etat] },
      h('span', {}, p.libelle),
      h('span', { class: 'pastille-valeur' }, p.valeur),
      h('span', { class: 'visuellement-masque' }, ` : ${LIBELLES_ETAT[p.etat]}`))));
}
