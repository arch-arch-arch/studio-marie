import { h } from './h.js';

// « Posts » couvre les carrousels et les photos.
export const CLE_FILTRE = { story: 'story', reel: 'reel', carrousel: 'post', post: 'post' };

// Un seul filtre pour tout le studio : l'état de l'aperçu (etat.apercu.filtres) sert dans Semaine, Jour, Mois et Aperçu.
export function formatVisible(f, filtres) {
  return !!filtres[CLE_FILTRE[f.format]];
}

// Nom au pluriel et accord du participe pour « masqué(s) » : seul « Stories » est féminin.
const FORMATS = [['story', 'Stories', 'masquées'], ['reel', 'Reels', 'masqués'], ['post', 'Posts', 'masqués']];

// Mention sous la barre : null quand rien n’est masqué, et quand tout l’est (la barre dit alors de cocher un format).
export function mentionFiltre(filtres) {
  const masques = FORMATS.filter(([cle]) => !filtres[cle]);
  if (!masques.length || masques.length === FORMATS.length) return null;
  const noms = masques.map(([, nom]) => nom);
  const liste = noms.length === 1 ? noms[0] : `${noms.slice(0, -1).join(', ')} et ${noms[noms.length - 1]}`;
  const accord = masques.length === 1 ? masques[0][2] : 'masqués';
  return `Filtre actif : ${liste} ${accord}`;
}

// Après un changement, la case touchée est reconstruite : le focus revient sur la même (le rendu est synchrone).
function focaliser(cle) {
  if (typeof document === 'undefined') return;
  document.querySelector(`.barre-formats [data-commande="${cle}"]`)?.focus();
}

export function barreFormats(filtres, actions) {
  const tous = !!(filtres.story && filtres.reel && filtres.post);
  const aucun = !(filtres.story || filtres.reel || filtres.post);
  const mention = mentionFiltre(filtres);
  const choixFormat = (cle, libelle) => h('label', { class: 'choix' },
    h('input', {
      type: 'checkbox', checked: !!filtres[cle], 'data-commande': `format:${cle}`,
      onchange: e => { actions.changerFiltresApercu({ ...filtres, [cle]: e.target.checked }); focaliser(`format:${cle}`); },
    }),
    libelle);
  return h('div', { class: 'barre-formats' },
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
      choixFormat('story', 'Stories'), choixFormat('reel', 'Reels'), choixFormat('post', 'Posts')),
    aucun
      ? h('p', { class: 'aide', role: 'status' }, 'Coche au moins un format.')
      : mention ? h('p', { class: 'mention-filtre' }, mention) : null);
}
