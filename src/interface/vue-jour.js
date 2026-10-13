import { h } from './h.js';
import { carte } from './carte.js';
import { cleJour, heureLocale, depuisSaisieLocale } from '../logique/dates.js';
import { categoriesDuProfil } from '../logique/categories.js';
import { APERCU_PAR_DEFAUT, creerCacheVisuels } from './vue-apercu.js';
import { oublierEchecs, visuelMiniature } from './visuels.js';
import { formatVisible, barreFormats } from './filtre-formats.js';

export function vueJour({ profil, fiches, ancre, apercu, cacheVisuels }, actions) {
  const r = profil.regles_studio;
  const cle = cleJour(ancre, r.fuseau);
  const filtres = (apercu ?? APERCU_PAR_DEFAUT).filtres;
  const cache = cacheVisuels ?? creerCacheVisuels();
  oublierEchecs(cache, `jour|${cle}`);
  const categories = categoriesDuProfil(profil);
  const duJour = fiches.filter(f => cleJour(f.date_heure, r.fuseau) === cle && formatVisible(f, filtres)).sort((a, b) => a.date_heure.localeCompare(b.date_heure));
  return h('div', { class: 'jour-vue' },
    barreFormats(filtres, actions),
    duJour.length
      ? h('ol', { class: 'frise' }, duJour.map(f => h('li', { class: 'frise-ligne' },
        h('span', { class: 'frise-heure' }, heureLocale(f.date_heure, r.fuseau)),
        carte(f, r, actions, null, categories, f.visuel ? visuelMiniature(f, cache, actions, 'carte') : null))))
      : h('p', { class: 'aide' }, 'Rien de prévu ce jour-là.'),
    h('button', {
      type: 'button', class: 'bouton-secondaire',
      onclick: () => actions.creerFiche({ format: 'reel', date_heure: depuisSaisieLocale(cle, '12:00', r.fuseau) }),
    }, '+ Ajouter un contenu'));
}
