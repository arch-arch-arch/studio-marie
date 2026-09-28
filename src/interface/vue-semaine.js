import { h } from './h.js';
import { carte, bandeau } from './carte.js';
import { controlerSemaine, fichesDeLaSemaine } from '../logique/controle.js';
import { creneauxLibres } from '../logique/creneaux.js';
import { debutSemaine, joursDeLaSemaine, cleJour, heureLocale, libelleJour, depuisSaisieLocale } from '../logique/dates.js';
import { LIBELLES_FORMAT } from '../logique/fiche.js';

export function vueSemaine({ profil, fiches, ancre, maintenant }, actions) {
  const r = profil.regles_studio;
  const debut = debutSemaine(ancre, r.fuseau);
  const semaine = fichesDeLaSemaine(fiches, debut, r.fuseau);
  const libres = creneauxLibres(fiches, r, debut, maintenant ?? null);
  return h('div', { class: 'semaine' },
    bandeau(controlerSemaine(fiches, r, debut)),
    h('div', { class: 'colonnes' }, joursDeLaSemaine(debut, r.fuseau).map(jour => colonne(jour, semaine, libres, r, actions))));
}

function colonne(jour, semaine, libres, r, actions) {
  const fz = r.fuseau;
  const cle = cleJour(jour, fz);
  const duJour = semaine.filter(f => cleJour(f.date_heure, fz) === cle).sort((a, b) => a.date_heure.localeCompare(b.date_heure));
  const vides = libres.filter(c => cleJour(c.date_heure, fz) === cle);
  const el = h('section', {
    class: 'jour', 'data-jour': cle,
    ondragover: e => { e.preventDefault(); el.classList.add('survol'); },
    ondragleave: () => el.classList.remove('survol'),
    ondrop: e => {
      e.preventDefault();
      el.classList.remove('survol');
      const id = e.dataTransfer?.getData('text/plain');
      if (id) actions.deplacerFiche(id, jour);
    },
  },
  h('h3', { class: 'jour-titre' }, libelleJour(jour, fz)),
  duJour.map(f => carte(f, r, actions)),
  vides.map(c => h('button', {
    type: 'button', class: 'creneau-vide',
    onclick: () => actions.creerFiche({ format: c.format, date_heure: c.date_heure }),
  }, `+ ${LIBELLES_FORMAT[c.format]} · ${heureLocale(c.date_heure, fz)}`)),
  h('button', {
    type: 'button', class: 'ajouter',
    onclick: () => actions.creerFiche({ format: 'reel', date_heure: depuisSaisieLocale(cle, '12:00', fz) }),
  }, '+ Ajouter'));
  return el;
}
