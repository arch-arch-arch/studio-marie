import { h } from './h.js';
import { datePublication, LIBELLES_FORMAT } from '../logique/fiche.js';
import { periodeAffichee } from '../logique/dossier.js';
import { categoriesDuProfil, categorieAffichee } from '../logique/categories.js';
import { couleurCategorie } from './carte.js';
import { creerCacheVisuels, oublierEchecs, visuelMiniature } from './visuels.js';
import { formatVisible, barreFormats } from './filtre-formats.js';

export { creerCacheVisuels };

// Valeurs initiales de l'aperçu, partagées par l'état de l'application et le contrôleur.
export const APERCU_PAR_DEFAUT = Object.freeze({
  periode: 'semaine',
  filtres: Object.freeze({ story: true, reel: true, post: true }),
});

const instant = f => new Date(datePublication(f)).getTime();

// Fiches de la période (publiées comprises, à leur date de publication), filtrées par format, dans l'ordre de leur date.
export function filtrerApercu(fiches, { debut, fin }, filtres) {
  const debutMs = new Date(debut).getTime();
  const finMs = new Date(fin).getTime();
  return fiches
    .filter(f => {
      const t = instant(f);
      return t >= debutMs && t < finMs && formatVisible(f, filtres);
    })
    .sort((a, b) => instant(a) - instant(b) || a.id.localeCompare(b.id));
}

// Clé d'affichage : la grille ne se reconstruit que si ce qu'elle montre change (pas à chaque frappe dans une fiche).
export function cleApercu(etat) {
  const apercu = etat.apercu ?? APERCU_PAR_DEFAUT;
  const periode = periodeAffichee(apercu.periode === 'mois' ? 'mois' : 'semaine', etat.ancre, etat.profil.regles_studio.fuseau);
  const visibles = filtrerApercu(etat.fiches, periode, apercu.filtres).map(f => {
    const cat = categorieAffichee(f);
    return [f.id, f.visuel ?? null, f.visuel_type ?? null, f.format, datePublication(f), f.statut, cat.etat === 'choisie' ? cat.cle : null, f.accroche ?? ''];
  });
  return JSON.stringify([etat.ancre, apercu.periode, periode.debut, periode.fin, apercu.filtres.story, apercu.filtres.reel, apercu.filtres.post, visibles]);
}

const dateCourte = (iso, fz) => new Intl.DateTimeFormat('fr-FR', { timeZone: fz, weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(iso));

function libelleMiniature(f, fz) {
  return [dateCourte(datePublication(f), fz), LIBELLES_FORMAT[f.format], f.accroche || 'Sans accroche', f.statut === 'publie' ? 'Publié' : null]
    .filter(Boolean).join(', ');
}

function miniature(f, fz, cache, actions, couleur) {
  return h('button', {
    type: 'button', class: 'miniature', style: { '--categorie': couleur }, 'aria-label': libelleMiniature(f, fz),
    onclick: () => actions.ouvrirFiche(f.id),
  },
  visuelMiniature(f, cache, actions, 'apercu'),
  h('span', { class: 'miniature-pied', 'aria-hidden': 'true' },
    h('span', {}, dateCourte(datePublication(f), fz)),
    h('span', {}, LIBELLES_FORMAT[f.format]),
    f.statut === 'publie' ? h('span', { class: 'miniature-publie' }, 'Publié') : null));
}

// Après un changement, la commande touchée est reconstruite : le focus revient sur la même (le rendu est synchrone).
function focaliser(cle) {
  if (typeof document === 'undefined') return;
  document.querySelector(`.vue-apercu [data-commande="${cle}"]`)?.focus();
}

function commandes(apercu, actions) {
  const { periode, filtres } = apercu;
  const choixPeriode = (valeur, libelle) => h('label', { class: 'choix' },
    h('input', {
      type: 'radio', name: 'periode-apercu', value: valeur, checked: periode === valeur, 'data-commande': `periode:${valeur}`,
      onchange: () => { actions.changerPeriodeApercu(valeur); focaliser(`periode:${valeur}`); },
    }),
    libelle);
  return h('div', { class: 'apercu-commandes' },
    h('fieldset', { class: 'apercu-periode' }, h('legend', {}, 'Période'), choixPeriode('semaine', 'Semaine'), choixPeriode('mois', 'Mois')),
    barreFormats(filtres, actions));
}

// Compte les fiches affichées par catégorie choisie ; une proposition non confirmée compte parmi les non rangées.
function legende(categories, fiches) {
  const compte = new Map(categories.map(c => [c.cle, 0]));
  let nonRangees = 0;
  for (const f of fiches) {
    const { cle, etat } = categorieAffichee(f);
    if (etat === 'choisie') compte.set(cle, compte.get(cle) + 1);
    else nonRangees += 1;
  }
  const element = (cle, nom, couleur, n) => h('span', { class: 'legende-item', 'data-categorie': cle, style: { '--categorie': couleur } },
    h('span', { class: 'legende-pastille', 'aria-hidden': 'true' }), `${nom} `, h('span', { class: 'legende-compte' }, String(n)));
  return h('div', { class: 'legende-categories', role: 'group', 'aria-label': 'Catégories' },
    h('span', { class: 'legende-titre' }, 'Catégories'),
    categories.map(c => element(c.cle, c.nom, c.couleur, compte.get(c.cle))),
    element('non_rangees', 'Non rangées', 'var(--trait)', nonRangees));
}

export function vueApercu(etat, actions) {
  const { profil, fiches, ancre } = etat;
  const apercu = etat.apercu ?? APERCU_PAR_DEFAUT;
  const fz = profil.regles_studio.fuseau;
  const categories = categoriesDuProfil(profil);
  const cache = etat.cacheVisuels ?? creerCacheVisuels();
  const periode = periodeAffichee(apercu.periode === 'mois' ? 'mois' : 'semaine', ancre, fz);
  oublierEchecs(cache, `${apercu.periode}|${periode.debut}`);
  const filtrees = filtrerApercu(fiches, periode, apercu.filtres);
  const aucunFormat = !(apercu.filtres.story || apercu.filtres.reel || apercu.filtres.post);
  // Sans format coché, la barre affiche « Coche au moins un format. » : la grille reste vide.
  let contenu = null;
  if (!aucunFormat) {
    contenu = !filtrees.length
      ? h('p', { class: 'aide', role: 'status' }, 'Rien de prévu sur cette période.')
      : h('div', { class: 'apercu-grille' }, filtrees.map(f => miniature(f, fz, cache, actions, couleurCategorie(f, categories))));
  }
  return h('div', { class: 'vue-apercu' },
    commandes(apercu, actions),
    legende(categories, aucunFormat ? [] : filtrees),
    contenu);
}
