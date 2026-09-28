import { h } from './h.js';
import { carte } from './carte.js';
import { cleJour, heureLocale, depuisSaisieLocale } from '../logique/dates.js';

export function vueJour({ profil, fiches, ancre }, actions) {
  const r = profil.regles_studio;
  const cle = cleJour(ancre, r.fuseau);
  const duJour = fiches.filter(f => cleJour(f.date_heure, r.fuseau) === cle).sort((a, b) => a.date_heure.localeCompare(b.date_heure));
  return h('div', { class: 'jour-vue' },
    duJour.length
      ? h('ol', { class: 'frise' }, duJour.map(f => h('li', { class: 'frise-ligne' },
        h('span', { class: 'frise-heure' }, heureLocale(f.date_heure, r.fuseau)),
        carte(f, r, actions))))
      : h('p', { class: 'aide' }, 'Rien de prévu ce jour-là.'),
    h('button', {
      type: 'button', class: 'bouton-secondaire',
      onclick: () => actions.creerFiche({ format: 'reel', date_heure: depuisSaisieLocale(cle, '12:00', r.fuseau) }),
    }, '+ Ajouter un contenu'));
}
