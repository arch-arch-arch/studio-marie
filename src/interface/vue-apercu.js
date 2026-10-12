import { h } from './h.js';
import { datePublication, LIBELLES_FORMAT } from '../logique/fiche.js';
import { periodeAffichee } from '../logique/dossier.js';
import { categoriesDuProfil, categorieAffichee } from '../logique/categories.js';
import { couleurCategorie } from './carte.js';

// Valeurs initiales de l'aperçu, partagées par l'état de l'application et le contrôleur.
export const APERCU_PAR_DEFAUT = Object.freeze({
  periode: 'semaine',
  filtres: Object.freeze({ story: true, reel: true, post: true }),
});

const LIMITE_DEMANDES = 4;
// Les liens de stockage expirent au bout d'une heure : on les renouvelle avant.
const DUREE_LIEN_MS = 50 * 60000;
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

// Les liens signés sont demandés un par un, au plus LIMITE_DEMANDES à la fois. Le cache garde, par visuel,
// la demande (en cours ou obtenue) et sa date ; une demande en échec reste marquée jusqu'au changement de période.
export function creerCacheVisuels({ maintenant = () => Date.now() } = {}) {
  return { urls: new Map(), enCours: 0, attente: [], maintenant, periodeCle: null };
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
  const entree = cache.urls.get(id);
  // Un visuel en échec reste en échec jusqu'au changement de période : pas de nouvelle demande à chaque reconstruction.
  if (entree?.echec) return Promise.reject(new Error('Visuel en échec'));
  if (entree && cache.maintenant() - entree.obtenuLe < DUREE_LIEN_MS) return entree.promesse;
  const nouvelle = { obtenuLe: cache.maintenant(), echec: false, promesse: null };
  nouvelle.promesse = new Promise((resoudre, rejeter) => cache.attente.push({ id, demander, resoudre, rejeter }));
  nouvelle.promesse.catch(() => { nouvelle.echec = true; });
  cache.urls.set(id, nouvelle);
  demanderSuivantes(cache);
  return nouvelle.promesse;
}

// Au changement de période, les visuels en échec sont de nouveau demandés.
function oublierEchecs(cache, cle) {
  if (cache.periodeCle === cle) return;
  cache.periodeCle = cle;
  for (const [id, entree] of cache.urls) if (entree.echec) cache.urls.delete(id);
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
  const indisponible = () => zone.replaceChildren(h('span', { class: 'miniature-indisponible' }, 'Visuel indisponible'));
  // Safari n'affiche souvent rien d'une vidéo avant la lecture : le fragment #t=0.001 force la première image.
  const charger = () => lienVisuel(cache, id => actions.urlVisuel(id), f.visuel).then(
    url => media.setAttribute('src', video ? `${url}#t=0.001` : url),
    indisponible,
  );
  // Une erreur de chargement du média refait un seul essai avec un lien neuf ; si elle revient, le visuel est marqué en échec.
  let essais = 0;
  media.addEventListener('error', () => {
    if (essais === 0) {
      essais = 1;
      cache.urls.delete(f.visuel);
      charger();
      return;
    }
    const entree = cache.urls.get(f.visuel);
    if (entree) entree.echec = true;
    indisponible();
  });
  charger();
  return zone;
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
  visuelMiniature(f, cache, actions),
  h('span', { class: 'miniature-pied', 'aria-hidden': 'true' },
    h('span', {}, dateCourte(datePublication(f), fz)),
    h('span', {}, LIBELLES_FORMAT[f.format]),
    f.statut === 'publie' ? h('span', { class: 'miniature-publie' }, 'Publié') : null));
}

// Après un changement, la commande touchée est reconstruite : le focus revient sur la même (le rendu est synchrone).
function focaliser(cle) {
  if (typeof document === 'undefined') return;
  document.querySelector(`.apercu [data-commande="${cle}"]`)?.focus();
}

function commandes(apercu, actions) {
  const { periode, filtres } = apercu;
  const choixPeriode = (valeur, libelle) => h('label', { class: 'choix' },
    h('input', {
      type: 'radio', name: 'periode-apercu', value: valeur, checked: periode === valeur, 'data-commande': `periode:${valeur}`,
      onchange: () => { actions.changerPeriodeApercu(valeur); focaliser(`periode:${valeur}`); },
    }),
    libelle);
  const choixFormat = (cle, libelle) => h('label', { class: 'choix' },
    h('input', {
      type: 'checkbox', checked: !!filtres[cle], 'data-commande': `format:${cle}`,
      onchange: e => { actions.changerFiltresApercu({ ...filtres, [cle]: e.target.checked }); focaliser(`format:${cle}`); },
    }),
    libelle);
  const tous = !!(filtres.story && filtres.reel && filtres.post);
  return h('div', { class: 'apercu-commandes' },
    h('fieldset', { class: 'apercu-periode' }, h('legend', {}, 'Période'), choixPeriode('semaine', 'Semaine'), choixPeriode('mois', 'Mois')),
    h('fieldset', { class: 'apercu-formats' }, h('legend', {}, 'Formats'),
      h('label', { class: 'choix' },
        h('input', {
          type: 'checkbox', checked: tous, 'data-commande': 'format:tout',
          onchange: e => {
            actions.changerFiltresApercu({ story: e.target.checked, reel: e.target.checked, post: e.target.checked });
            focaliser('format:tout');
          },
        }),
        'Tout'),
      choixFormat('story', 'Stories'), choixFormat('reel', 'Reels'), choixFormat('post', 'Posts')));
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
  let contenu;
  if (aucunFormat) contenu = h('p', { class: 'aide', role: 'status' }, 'Coche au moins un format.');
  else if (!filtrees.length) contenu = h('p', { class: 'aide', role: 'status' }, 'Rien de prévu sur cette période.');
  else contenu = h('div', { class: 'apercu-grille' }, filtrees.map(f => miniature(f, fz, cache, actions, couleurCategorie(f, categories))));
  return h('div', { class: 'apercu' },
    commandes(apercu, actions),
    legende(categories, aucunFormat ? [] : filtrees),
    contenu);
}
