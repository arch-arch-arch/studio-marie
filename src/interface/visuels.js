import { h } from './h.js';

const LIMITE_DEMANDES = 4;
// Les liens de stockage expirent au bout d'une heure : on les renouvelle avant.
const DUREE_LIEN_MS = 50 * 60000;
// Lettre lue sur la vignette sans visuel ou dont le visuel est indisponible : le format ne dépend ni du survol ni de la couleur.
export const LETTRES = { reel: 'R', carrousel: 'C', story: 'S', post: 'P' };

// Les liens signés sont demandés un par un, au plus LIMITE_DEMANDES à la fois. Le cache garde, par visuel,
// la demande (en cours ou obtenue) et sa date ; une demande en échec reste marquée jusqu'au changement de période.
// Il garde aussi les nœuds déjà construits : une reconstruction les déplace au lieu de recréer les médias.
export function creerCacheVisuels({ maintenant = () => Date.now() } = {}) {
  return { urls: new Map(), noeuds: new Map(), enCours: 0, attente: [], maintenant, periodeCle: null };
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

// Au changement de période, les visuels en échec sont de nouveau demandés et les nœuds construits sont oubliés.
export function oublierEchecs(cache, cle) {
  if (cache.periodeCle === cle) return;
  cache.periodeCle = cle;
  for (const [id, entree] of cache.urls) if (entree.echec) cache.urls.delete(id);
  cache.noeuds.clear();
}

// Visuel d'une fiche (image, ou vidéo avec sa première image). Le nœud est gardé par portée (carte, vignette, apercu) :
// une reconstruction le réutilise, et ne renouvelle le lien que s'il a expiré.
// En vignette, la lettre du format est en fond sous le visuel : elle reste seule si le visuel ne charge pas.
export function visuelMiniature(f, cache, actions, portee = 'apercu') {
  if (!f.visuel) return h('span', { class: 'miniature-vide' }, f.accroche || 'Sans visuel');
  const cle = `${portee}:${f.id}:${f.visuel}:${f.visuel_type}`;
  const existant = cache.noeuds.get(cle);
  if (existant) {
    existant.reparer();
    return existant.zone;
  }
  const vignette = portee === 'vignette';
  const video = f.visuel_type === 'video';
  const media = video ? h('video') : h('img');
  media.setAttribute('alt', '');
  if (video) {
    media.muted = true;
    media.setAttribute('muted', '');
    media.setAttribute('playsinline', '');
    // En vignette, la première image n'est pas exigée : pas de téléchargement tant que la vue ne le demande pas.
    media.setAttribute('preload', vignette ? 'none' : 'metadata');
  } else {
    media.setAttribute('loading', 'lazy');
  }
  const lettre = () => h('span', { class: 'vignette-lettre', 'aria-hidden': 'true' }, LETTRES[f.format]);
  const zone = h('span', { class: 'miniature-media' },
    vignette ? lettre() : null,
    media,
    video && !vignette ? h('span', { class: 'marque-lecture', 'aria-hidden': 'true' }) : null);
  const indisponible = () => zone.replaceChildren(vignette ? lettre() : h('span', { class: 'miniature-indisponible' }, 'Visuel indisponible'));
  // Safari n'affiche souvent rien d'une vidéo avant la lecture : le fragment #t=0.001 force la première image.
  // Une source déjà en place n'est pas réaffectée (un média réaffecté se recharge), sauf après une erreur.
  const charger = (nouvelEssai = false) => lienVisuel(cache, id => actions.urlVisuel(id), f.visuel).then(
    url => {
      const source = video ? `${url}#t=0.001` : url;
      if (nouvelEssai || media.getAttribute('src') !== source) media.setAttribute('src', source);
    },
    indisponible,
  );
  // Une erreur de chargement du média refait un seul essai avec un lien neuf ; si elle revient, le visuel est marqué en échec.
  let essais = 0;
  // Une erreur arrivée pendant que le nœud est hors écran est notée : la réutilisation fait alors l’essai.
  let erreurHorsEcran = false;
  const essaiSuivant = () => {
    if (essais === 0) {
      essais = 1;
      cache.urls.delete(f.visuel);
      charger(true);
      return;
    }
    const entree = cache.urls.get(f.visuel);
    if (entree) entree.echec = true;
    indisponible();
  };
  media.addEventListener(video ? 'loadeddata' : 'load', () => { essais = 0; });
  media.addEventListener('error', () => {
    if (!media.isConnected) { erreurHorsEcran = true; return; }
    essaiSuivant();
  });
  // Réutilisation : une erreur notée hors écran compte pour le seul essai ; sinon le lien n’est renouvelé qu’après expiration.
  const reparer = () => {
    if (!erreurHorsEcran) { charger(); return; }
    erreurHorsEcran = false;
    essaiSuivant();
  };
  cache.noeuds.set(cle, { zone, reparer });
  charger();
  return zone;
}
