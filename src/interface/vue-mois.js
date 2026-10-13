import { h } from './h.js';
import { semainesDuMois, joursDeLaSemaine, debutMois, partiesLocales, cleJour } from '../logique/dates.js';
import { LIBELLES_FORMAT } from '../logique/fiche.js';
import { periodeAffichee } from '../logique/dossier.js';
import { rangeeAnalyse, sectionAvis } from './panneau-analyse.js';
import { categoriesDuProfil } from '../logique/categories.js';
import { couleurCategorie } from './carte.js';
import { APERCU_PAR_DEFAUT, creerCacheVisuels } from './vue-apercu.js';
import { oublierEchecs, visuelMiniature } from './visuels.js';
import { formatVisible, barreFormats } from './filtre-formats.js';

const ENTETES = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
// Lettre lue sur la vignette sans visuel : le format ne doit pas dépendre du survol (title) ni de la couleur.
const LETTRES = { reel: 'R', carrousel: 'C', story: 'S', post: 'P' };
// Au plus trois vignettes par jour, le reste en « +N ».
const VIGNETTES_MAX = 3;

// Nom accessible de la case du jour : nombre de contenus, puis formats distincts.
function libelleCase(jour, duJour, fz) {
  const n = duJour.length;
  const formats = [...new Set(duJour.map(f => LIBELLES_FORMAT[f.format]))];
  const date = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: fz }).format(new Date(jour));
  return `${date}, ${n} contenu${n > 1 ? 's' : ''}${formats.length ? ` : ${formats.join(', ')}` : ''}`;
}

// Vignette d’une fiche : son visuel, ou sa lettre de format quand elle n’en a pas. Un span, jamais un bouton : la case en est un.
function vignette(f, cache, actions, categories) {
  return h('span', {
    class: 'vignette', title: `${LIBELLES_FORMAT[f.format]} · ${f.accroche || 'sans accroche'}`,
    style: { '--categorie': couleurCategorie(f, categories, 'var(--texte-2)') },
  },
  f.visuel ? visuelMiniature(f, cache, actions, 'vignette') : h('span', { class: 'vignette-lettre', 'aria-hidden': 'true' }, LETTRES[f.format]));
}

export function vueMois({ profil, fiches, ancre, analyse, analyses, avisOuverts, apercu, cacheVisuels }, actions, capacites = {}) {
  const fz = profil.regles_studio.fuseau;
  const categories = categoriesDuProfil(profil);
  const moisCourant = partiesLocales(debutMois(ancre, fz), fz).mois;
  const filtres = (apercu ?? APERCU_PAR_DEFAUT).filtres;
  const cache = cacheVisuels ?? creerCacheVisuels();
  oublierEchecs(cache, `mois|${periodeAffichee('mois', ancre, fz).debut}`);
  return h('div', { class: 'mois' },
    capacites.dossier ? rangeeAnalyse('Analyser le mois', analyse, actions) : null,
    barreFormats(filtres, actions),
    sectionAvis(analyses, periodeAffichee('mois', ancre, fz), fiches, fz, avisOuverts),
    h('div', { class: 'mois-entetes', 'aria-hidden': 'true' }, ENTETES.map(j => h('span', {}, j))),
    semainesDuMois(ancre, fz).map(semaine => h('div', { class: 'mois-semaine' },
      joursDeLaSemaine(semaine, fz).map(jour => {
        const cle = cleJour(jour, fz);
        const p = partiesLocales(jour, fz);
        const duJour = fiches.filter(f => cleJour(f.date_heure, fz) === cle && formatVisible(f, filtres)).sort((a, b) => a.date_heure.localeCompare(b.date_heure));
        return h('button', {
          type: 'button', class: p.mois === moisCourant ? 'mois-jour' : 'mois-jour hors-mois',
          'aria-label': libelleCase(jour, duJour, fz),
          onclick: () => actions.changerVue('jour', jour),
        },
        h('span', { class: 'mois-num' }, String(p.jour)),
        h('span', { class: 'points' },
          duJour.slice(0, VIGNETTES_MAX).map(f => vignette(f, cache, actions, categories)),
          duJour.length > VIGNETTES_MAX ? h('span', { class: 'vignette-plus' }, `+${duJour.length - VIGNETTES_MAX}`) : null));
      }))));
}
