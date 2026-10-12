import { h } from './h.js';
import { datePublication, LIBELLES_FORMAT } from '../logique/fiche.js';
import { periodeAffichee } from '../logique/dossier.js';
import { categoriesDuProfil, categorieAffichee } from '../logique/categories.js';
import { couleurCategorie } from './carte.js';

const LIMITE_DEMANDES = 4;
const COCHES_PAR_DEFAUT = { story: true, reel: true, post: true };
// « Posts » couvre les carrousels et les photos.
const CLE_FILTRE = { story: 'story', reel: 'reel', carrousel: 'post', post: 'post' };

const instant = f => new Date(datePublication(f)).getTime();

// Fiches de la période (publiées comprises, à leur date de publication), filtrées par format, dans l'ordre de leur date.
export function filtrerApercu(fiches, { debut, fin }, filtres) {
  const debutMs = new Date(debut).getTime();
  const finMs = new Date(fin).getTime();
  return fiches
    .filter(f => {
      const t = instant(f);
      return t >= debutMs && t < finMs && !!filtres[CLE_FILTRE[f.format]];
    })
    .sort((a, b) => instant(a) - instant(b) || a.id.localeCompare(b.id));
}

// Les liens signés sont demandés un par un, au plus LIMITE_DEMANDES à la fois. Le cache garde les liens
// obtenus (et les demandes en cours) d'une reconstruction de la vue à l'autre ; une demande en échec est oubliée.
export function creerCacheVisuels() {
  return { urls: new Map(), enCours: 0, attente: [] };
}

function demanderSuivantes(cache) {
  while (cache.enCours < LIMITE_DEMANDES && cache.attente.length) {
    const { id, demander, resoudre, rejeter } = cache.attente.shift();
    cache.enCours += 1;
    let promesse;
    try { promesse = Promise.resolve(demander(id)); } catch (e) { promesse = Promise.reject(e); }
    promesse.then(resoudre, rejeter).finally(() => {
      cache.enCours -= 1;
      demanderSuivantes(cache);
    });
  }
}

function lienVisuel(cache, demander, id) {
  if (!cache.urls.has(id)) {
    const promesse = new Promise((resoudre, rejeter) => cache.attente.push({ id, demander, resoudre, rejeter }));
    promesse.catch(() => { cache.urls.delete(id); });
    cache.urls.set(id, promesse);
    demanderSuivantes(cache);
  }
  return cache.urls.get(id);
}

function visuelMiniature(f, cache, actions) {
  if (!f.visuel) return h('span', { class: 'miniature-vide' }, f.accroche || 'Sans visuel');
  const video = f.visuel_type === 'video';
  const media = video ? h('video') : h('img');
  media.setAttribute('alt', '');
  if (video) {
    media.muted = true;
    media.setAttribute('muted', '');
    media.setAttribute('playsinline', '');
    media.setAttribute('preload', 'metadata');
  } else {
    media.setAttribute('loading', 'lazy');
  }
  const zone = h('span', { class: 'miniature-media' }, media, video ? h('span', { class: 'marque-lecture', 'aria-hidden': 'true' }) : null);
  const demander = id => (typeof actions.urlVisuel === 'function' ? actions.urlVisuel(id) : `/_blob/${id}`);
  lienVisuel(cache, demander, f.visuel).then(
    url => media.setAttribute('src', url),
    () => zone.replaceChildren(h('span', { class: 'miniature-indisponible' }, 'Visuel indisponible')),
  );
  return zone;
}

const dateCourte = (iso, fz) => new Intl.DateTimeFormat('fr-FR', { timeZone: fz, weekday: 'short', day: 'numeric', month: 'numeric' }).format(new Date(iso));

function miniature(f, fz, cache, actions, couleur) {
  return h('button', {
    type: 'button', class: 'miniature', style: { '--categorie': couleur },
    onclick: () => actions.ouvrirFiche(f.id),
  },
  visuelMiniature(f, cache, actions),
  h('span', { class: 'miniature-pied' },
    h('span', {}, dateCourte(datePublication(f), fz)),
    h('span', {}, LIBELLES_FORMAT[f.format]),
    f.statut === 'publie' ? h('span', { class: 'miniature-publie' }, 'Publié') : null));
}

function commandes(apercu, actions) {
  const { periode, filtres } = apercu;
  const choixPeriode = (valeur, libelle) => h('label', { class: 'choix' },
    h('input', { type: 'radio', name: 'periode-apercu', value: valeur, checked: periode === valeur, onchange: () => actions.changerPeriodeApercu(valeur) }),
    libelle);
  const choixFormat = (cle, libelle) => h('label', { class: 'choix' },
    h('input', { type: 'checkbox', checked: !!filtres[cle], onchange: e => actions.changerFiltresApercu({ ...filtres, [cle]: e.target.checked }) }),
    libelle);
  const tous = !!(filtres.story && filtres.reel && filtres.post);
  return h('div', { class: 'apercu-commandes' },
    h('fieldset', { class: 'apercu-periode' }, h('legend', {}, 'Période'), choixPeriode('semaine', 'Semaine'), choixPeriode('mois', 'Mois')),
    h('fieldset', { class: 'apercu-formats' }, h('legend', {}, 'Formats'),
      h('label', { class: 'choix' },
        h('input', { type: 'checkbox', checked: tous, onchange: e => actions.changerFiltresApercu({ story: e.target.checked, reel: e.target.checked, post: e.target.checked }) }),
        'Tout'),
      choixFormat('story', 'Stories'), choixFormat('reel', 'Reels'), choixFormat('post', 'Posts')));
}

// Compte les fiches par catégorie choisie ; une proposition non confirmée compte parmi les non rangées.
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
  const apercu = etat.apercu ?? { periode: 'semaine', filtres: COCHES_PAR_DEFAUT };
  const fz = profil.regles_studio.fuseau;
  const categories = categoriesDuProfil(profil);
  const cache = etat.cacheVisuels ?? creerCacheVisuels();
  const periode = periodeAffichee(apercu.periode === 'mois' ? 'mois' : 'semaine', ancre, fz);
  const filtrees = filtrerApercu(fiches, periode, apercu.filtres);
  const aucunFormat = !(apercu.filtres.story || apercu.filtres.reel || apercu.filtres.post);
  let contenu;
  if (aucunFormat) contenu = h('p', { class: 'aide', role: 'status' }, 'Coche au moins un format.');
  else if (!filtrees.length) contenu = h('p', { class: 'aide', role: 'status' }, 'Rien de prévu sur cette période.');
  else contenu = h('div', { class: 'apercu-grille' }, filtrees.map(f => miniature(f, fz, cache, actions, couleurCategorie(f, categories))));
  return h('div', { class: 'apercu' },
    commandes(apercu, actions),
    legende(categories, aucunFormat ? [] : filtrees),
    contenu);
}
