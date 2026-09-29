import { h } from './h.js';
import { carte, bandeau } from './carte.js';
import { controlerSemaine, fichesDeLaSemaine } from '../logique/controle.js';
import { creneauxLibres } from '../logique/creneaux.js';
import { debutSemaine, joursDeLaSemaine, cleJour, heureLocale, libelleJour, depuisSaisieLocale } from '../logique/dates.js';
import { LIBELLES_FORMAT } from '../logique/fiche.js';
import { prochaineAction, ACTIONS_SANS_SUITE } from '../logique/parcours.js';

export function vueSemaine({ profil, fiches, ancre, maintenant, bulletin, stats }, actions) {
  const r = profil.regles_studio;
  const debut = debutSemaine(ancre, r.fuseau);
  const semaine = fichesDeLaSemaine(fiches, debut, r.fuseau);
  const libres = creneauxLibres(fiches, r, debut, maintenant ?? null);
  const semainePassee = maintenant != null && debut < debutSemaine(maintenant, r.fuseau);
  const maintenantIso = maintenant ?? new Date().toISOString();
  const actionsParId = new Map(semaine.map(f => [f.id, prochaineAction(f, (stats ?? []).filter(s => s.fiche === f.id), maintenantIso, r.fuseau)]));
  return h('div', { class: 'semaine' },
    bulletin === null && !semainePassee
      ? h('p', { class: 'sans-bulletin' }, 'Pas de bulletin pour cette semaine. ', h('button', { type: 'button', class: 'bouton-lien', onclick: () => actions.changerVue('bulletin') }, 'Voir l’onglet Bulletin'))
      : null,
    bandeau(controlerSemaine(fiches, r, debut)),
    aFaire(semaine, actionsParId, r.fuseau, actions),
    h('div', { class: 'colonnes' }, joursDeLaSemaine(debut, r.fuseau).map(jour => colonne(jour, semaine, libres, r, actions, actionsParId))));
}

function colonne(jour, semaine, libres, r, actions, actionsParId) {
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
  duJour.map(f => carte(f, r, actions, actionsParId.get(f.id))),
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

function aFaire(semaine, actionsParId, fz, actions) {
  const lignes = semaine
    .map(f => ({ f, a: actionsParId.get(f.id) }))
    .filter(({ a }) => !ACTIONS_SANS_SUITE.has(a.cle))
    .sort((x, y) => (Number(y.a.retard) - Number(x.a.retard)) || x.f.date_heure.localeCompare(y.f.date_heure));
  return h('section', { class: 'a-faire' }, h('h3', {}, 'À faire cette semaine'),
    lignes.length
      ? h('ul', {}, lignes.map(({ f, a }) => h('li', { class: a.retard ? 'action-retard' : null },
        h('span', {}, `${LIBELLES_FORMAT[f.format]} · ${libelleJour(f.date_heure, fz)} ${heureLocale(f.date_heure, fz)} · ${f.accroche || 'Sans accroche'}`),
        h('strong', {}, a.libelle),
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => actions.ouvrirFiche(f.id) }, 'Ouvrir'))))
      : h('p', { class: 'aide' }, 'Rien à faire cette semaine.'));
}
