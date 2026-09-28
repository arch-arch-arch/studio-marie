import { h } from './h.js';
import { semainesDuMois, joursDeLaSemaine, debutMois, partiesLocales, cleJour } from '../logique/dates.js';
import { LIBELLES_FORMAT } from '../logique/fiche.js';

const ENTETES = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];

export function vueMois({ profil, fiches, ancre }, actions) {
  const fz = profil.regles_studio.fuseau;
  const moisCourant = partiesLocales(debutMois(ancre, fz), fz).mois;
  return h('div', { class: 'mois' },
    h('div', { class: 'mois-entetes', 'aria-hidden': 'true' }, ENTETES.map(j => h('span', {}, j))),
    semainesDuMois(ancre, fz).map(semaine => h('div', { class: 'mois-semaine' },
      joursDeLaSemaine(semaine, fz).map(jour => {
        const cle = cleJour(jour, fz);
        const p = partiesLocales(jour, fz);
        const duJour = fiches.filter(f => cleJour(f.date_heure, fz) === cle).sort((a, b) => a.date_heure.localeCompare(b.date_heure));
        return h('button', {
          type: 'button', class: p.mois === moisCourant ? 'mois-jour' : 'mois-jour hors-mois',
          'aria-label': `${cle}, ${duJour.length} contenu${duJour.length > 1 ? 's' : ''}`,
          onclick: () => actions.changerVue('jour', jour),
        },
        h('span', { class: 'mois-num' }, String(p.jour)),
        h('span', { class: 'points' }, duJour.map(f => h('span', {
          class: `point-format format-${f.format}`, title: `${LIBELLES_FORMAT[f.format]} · ${f.accroche || 'sans accroche'}`,
        }))));
      }))));
}
