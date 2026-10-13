import { h } from './h.js';
import { carte, bandeau, LIBELLES_ETAT } from './carte.js';
import { controlerSemaine, fichesDeLaSemaine } from '../logique/controle.js';
import { creneauxLibres } from '../logique/creneaux.js';
import { debutSemaine, ajouterJours, joursDeLaSemaine, cleJour, heureLocale, libelleJour, depuisSaisieLocale, partiesLocales } from '../logique/dates.js';
import { LIBELLES_FORMAT, texteCourt } from '../logique/fiche.js';
import { prochaineAction, ACTIONS_SANS_SUITE } from '../logique/parcours.js';
import { periodeAffichee } from '../logique/dossier.js';
import { rangeeAnalyse, sectionAvis } from './panneau-analyse.js';
import { controlerCategories, categoriesDuProfil, categorieAffichee } from '../logique/categories.js';
import { APERCU_PAR_DEFAUT } from './vue-apercu.js';
import { creerCacheVisuels, oublierEchecs, visuelMiniature } from './visuels.js';
import { formatVisible, barreFormats } from './filtre-formats.js';

// La vue montre deux semaines : celle de l’ancre, puis la suivante, chacune dans son bloc.
export function vueSemaine({ profil, fiches, ancre, maintenant, stats, analyse, analyses, avisOuverts, apercu, cacheVisuels, volets }, actions, capacites = {}) {
  const r = profil.regles_studio;
  const debut = debutSemaine(ancre, r.fuseau);
  const semaines = [debut, ajouterJours(debut, 7, r.fuseau)];
  const filtres = (apercu ?? APERCU_PAR_DEFAUT).filtres;
  const cache = cacheVisuels ?? creerCacheVisuels();
  oublierEchecs(cache, `semaine|${debut}`);
  // Chaque semaine a ses fiches, ses créneaux libres et son contrôle ; le contrôle et la légende comptent toutes les fiches.
  const parSemaine = semaines.map(d => fichesDeLaSemaine(fiches, d, r.fuseau));
  const libresParSemaine = semaines.map(d => creneauxLibres(fiches, r, d, maintenant ?? null));
  // Seules les fiches des formats cochés sont affichées.
  const visiblesParSemaine = parSemaine.map(semaine => semaine.filter(f => formatVisible(f, filtres)));
  const maintenantIso = maintenant ?? new Date().toISOString();
  const toutes = parSemaine.flat();
  const actionsParId = new Map(toutes.map(f => [f.id, prochaineAction(f, (stats ?? []).filter(s => s.fiche === f.id), maintenantIso, r.fuseau, r)]));
  const categories = categoriesDuProfil(profil);
  return h('div', { class: 'semaine' },
    capacites.dossier ? rangeeAnalyse('Analyser la semaine', analyse, actions) : null,
    barreFormats(filtres, actions),
    sectionAvis(analyses, periodeAffichee('semaine', ancre, r.fuseau), fiches, r.fuseau, avisOuverts),
    aFaire(visiblesParSemaine.flat(), actionsParId, r.fuseau, actions, volets),
    semaines.map((d, i) => h('section', { class: 'semaine-bloc' },
      h('h2', { class: 'semaine-titre' }, titreSemaine(d, r.fuseau)),
      bandeau(controlerSemaine(fiches, r, d), volets, `bandeau-detail:${d}`),
      legendeCategories(profil, categories, parSemaine[i], controlerCategories(fiches, profil, d)),
      h('div', { class: 'colonnes' }, joursDeLaSemaine(d, r.fuseau).map(jour => colonne(jour, visiblesParSemaine[i], libresParSemaine[i], r, actions, actionsParId, categories, cache, filtres))))));
}

const MOIS = ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'];

// « Semaine du 12 au 18 octobre », ou « Semaine du 26 octobre au 1er novembre » à cheval sur deux mois.
function titreSemaine(debut, fuseau) {
  const a = partiesLocales(debut, fuseau);
  const b = partiesLocales(ajouterJours(debut, 6, fuseau), fuseau);
  const jour = n => (n === 1 ? '1er' : String(n));
  const premier = a.mois === b.mois ? jour(a.jour) : `${jour(a.jour)} ${MOIS[a.mois - 1]}`;
  return `Semaine du ${premier} au ${jour(b.jour)} ${MOIS[b.mois - 1]}`;
}

// Valeur courte d’une pastille de catégorie : « n/cible » pour le fil, « n/min-max » ou « n/min » pour les stories.
function valeurCourte(p) {
  if (p.cible !== undefined) return `${p.n}/${p.cible}`;
  if (p.min !== undefined) return p.min !== p.max ? `${p.n}/${p.min}-${p.max}` : `${p.n}/${p.min}`;
  return p.valeur;
}

// Une catégorie (ou « Non rangées ») : pastille de couleur, nom, valeur courte. L’état le pire se voit par une classe,
// et par un texte masqué qui reprend la valeur longue ; le title la donne aussi.
function ligneCategorie(cle, nom, couleur, pastilles) {
  const longues = pastilles.map(p => p.valeur).join(' · ');
  const courte = pastilles.map(valeurCourte).join(' · ');
  const pire = pastilles.reduce((a, p) => (ORDRE[p.etat] > ORDRE[a] ? p.etat : a), 'vert');
  const etat = pastilles.length && pire !== 'vert' ? pire : null;
  return h('span', {
    class: etat ? `legende-item etat-${etat}` : 'legende-item', 'data-categorie': cle,
    style: { '--categorie': couleur }, title: longues || null,
  },
  h('span', { class: 'legende-pastille', 'aria-hidden': 'true' }),
  h('span', { class: 'legende-nom' }, nom),
  courte ? h('span', { class: 'legende-valeur', 'aria-hidden': 'true' }, courte) : null,
  longues ? h('span', { class: 'visuellement-masque' }, etat ? etatsDetailles(pastilles) : longues) : null);
}
const ORDRE = { vert: 0, orange: 1, rouge: 2 };

// Texte masqué quand l’état n’est pas vert : chaque valeur orange ou rouge porte son état, les vertes restent nues.
const etatsDetailles = pastilles => pastilles.map(p => (p.etat === 'vert' ? p.valeur : `${p.valeur} : ${LIBELLES_ETAT[p.etat]}`)).join(' ; ');

// Légende sous le contrôle : quand le profil a la section des catégories, ou quand une fiche de la semaine est rangée.
function legendeCategories(profil, categories, semaine, pastilles) {
  if (!profil.categories_de_contenu && !semaine.some(f => categorieAffichee(f).etat === 'choisie')) return null;
  return h('div', { class: 'legende-categories', role: 'group', 'aria-label': 'Catégories' },
    h('span', { class: 'legende-titre' }, 'Catégories'),
    categories.map(c => ligneCategorie(c.cle, c.nom, c.couleur, pastilles.filter(p => p.cle === `${c.cle}_fil` || p.cle === `${c.cle}_stories`))),
    pastilles.filter(p => p.cle === 'non_rangees').map(p => ligneCategorie('non_rangees', p.libelle, 'var(--trait)', [p])));
}

function colonne(jour, semaine, libres, r, actions, actionsParId, categories, cache, filtres) {
  const fz = r.fuseau;
  const cle = cleJour(jour, fz);
  const duJour = semaine.filter(f => cleJour(f.date_heure, fz) === cle).sort((a, b) => a.date_heure.localeCompare(b.date_heure));
  // Un seul bouton par jour : le premier créneau conseillé pour un format visible, sinon « + Ajouter ».
  const suggestion = libres
    .filter(c => cleJour(c.date_heure, fz) === cle && formatVisible(c, filtres))
    .sort((a, b) => a.date_heure.localeCompare(b.date_heure))[0];
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
  duJour.map(f => carte(f, r, actions, actionsParId.get(f.id), categories, f.visuel ? visuelMiniature(f, cache, actions, 'carte') : null)),
  suggestion
    ? h('button', {
      type: 'button', class: 'creneau-vide',
      onclick: () => actions.creerFiche({ format: suggestion.format, date_heure: suggestion.date_heure }),
    }, `+ ${LIBELLES_FORMAT[suggestion.format]} · ${heureLocale(suggestion.date_heure, fz)}`)
    : h('button', {
      type: 'button', class: 'ajouter', 'aria-label': `Ajouter un contenu le ${libelleJour(jour, fz)}`,
      onclick: () => actions.creerFiche({ format: 'reel', date_heure: depuisSaisieLocale(cle, '12:00', fz) }),
    }, '+ Ajouter'));
  return el;
}

// « À faire (N) » replié ; ouvert d’office quand une ligne est en retard. Sans ligne, pas de section.
function aFaire(semaine, actionsParId, fz, actions, volets) {
  const lignes = semaine
    .map(f => ({ f, a: actionsParId.get(f.id) }))
    .filter(({ a }) => !ACTIONS_SANS_SUITE.has(a.cle))
    .sort((x, y) => (Number(y.a.retard) - Number(x.a.retard)) || x.f.date_heure.localeCompare(y.f.date_heure));
  if (!lignes.length) return null;
  const nRetards = lignes.filter(({ a }) => a.retard).length;
  const retard = nRetards > 0;
  // Un choix déjà fait (volets) l’emporte sur l’ouverture d’office pour le retard.
  const ouvert = volets?.has('a-faire') ? volets.get('a-faire') : retard;
  return h('details', { class: 'a-faire', open: ouvert, ontoggle: e => {
    const d = e.currentTarget;
    const avant = volets?.has('a-faire') ? volets.get('a-faire') : retard;
    if (volets && d.isConnected && d.open !== avant) volets.set('a-faire', d.open);
  } },
    h('summary', {}, h('h3', { class: 'a-faire-titre' }, `À faire (${lignes.length}${retard ? `, dont ${nRetards} en retard` : ''})`)),
    h('ul', {}, lignes.map(({ f, a }) => h('li', { class: a.retard ? 'action-retard' : null },
      h('span', {}, `${LIBELLES_FORMAT[f.format]} · ${libelleJour(f.date_heure, fz)} ${heureLocale(f.date_heure, fz)} · ${texteCourt(f) || 'Sans caption'}`),
      h('strong', {}, a.libelle),
      a.detail ? h('span', { class: 'aide' }, a.detail) : null,
      h('button', { type: 'button', class: 'bouton-lien', 'aria-label': `Ouvrir « ${texteCourt(f) || 'Sans caption'} »`, onclick: () => actions.ouvrirFiche(f.id) }, 'Ouvrir')))));
}
