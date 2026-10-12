import { h } from './h.js';
import { semainesDuMois, joursDeLaSemaine, debutMois, partiesLocales, cleJour } from '../logique/dates.js';
import { LIBELLES_FORMAT } from '../logique/fiche.js';
import { periodeAffichee } from '../logique/dossier.js';
import { rangeeAnalyse, sectionAvis } from './panneau-analyse.js';
import { categoriesDuProfil } from '../logique/categories.js';
import { couleurCategorie } from './carte.js';

const ENTETES = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
// Lettre lue sur le point : le format ne doit pas dépendre du survol (title) ni de la couleur.
const LETTRES = { reel: 'R', carrousel: 'C', story: 'S', post: 'P' };

// Nom accessible de la case du jour : nombre de contenus, puis formats distincts.
function libelleCase(jour, duJour, fz) {
  const n = duJour.length;
  const formats = [...new Set(duJour.map(f => LIBELLES_FORMAT[f.format]))];
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: fz }).format(new Date(jour));
  return `${date}, ${n} contenu${n > 1 ? 's' : ''}${formats.length ? ` : ${formats.join(', ')}` : ''}`;
}

export function vueMois({ profil, fiches, ancre, analyse, analyses, avisOuverts }, actions, capacites = {}) {
  const fz = profil.regles_studio.fuseau;
  const categories = categoriesDuProfil(profil);
  const moisCourant = partiesLocales(debutMois(ancre, fz), fz).mois;
  return h('div', { class: 'mois' },
    capacites.dossier ? rangeeAnalyse('Analyser le mois', analyse, actions) : null,
    sectionAvis(analyses, periodeAffichee('mois', ancre, fz), fiches, fz, avisOuverts),
    h('div', { class: 'mois-entetes', 'aria-hidden': 'true' }, ENTETES.map(j => h('span', {}, j))),
    semainesDuMois(ancre, fz).map(semaine => h('div', { class: 'mois-semaine' },
      joursDeLaSemaine(semaine, fz).map(jour => {
        const cle = cleJour(jour, fz);
        const p = partiesLocales(jour, fz);
        const duJour = fiches.filter(f => cleJour(f.date_heure, fz) === cle).sort((a, b) => a.date_heure.localeCompare(b.date_heure));
        return h('button', {
          type: 'button', class: p.mois === moisCourant ? 'mois-jour' : 'mois-jour hors-mois',
          'aria-label': libelleCase(jour, duJour, fz),
          onclick: () => actions.changerVue('jour', jour),
        },
        h('span', { class: 'mois-num' }, String(p.jour)),
        h('span', { class: 'points' }, duJour.map(f => h('span', {
          class: `point-format format-${f.format}`, style: { '--categorie': couleurCategorie(f, categories, 'var(--texte-2)') }, title: `${LIBELLES_FORMAT[f.format]} · ${f.accroche || 'sans accroche'}`,
        }, h('span', { class: 'point-lettre', 'aria-hidden': 'true' }, LETTRES[f.format])))));
      }))));
}
