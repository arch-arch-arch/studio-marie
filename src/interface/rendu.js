import { h } from './h.js';
import { debutSemaine, ajouterJours } from '../logique/dates.js';
import { vueSemaine } from './vue-semaine.js';
import { vueMois } from './vue-mois.js';
import { vueJour } from './vue-jour.js';
import { vueProfil } from './vue-profil.js';
import { vueBulletin } from './vue-bulletin.js';
import { vueTableau } from './vue-tableau.js';
import { panneauFiche } from './panneau-fiche.js';

const LIBELLES_SAUVEGARDE = { ok: 'Enregistré', en_cours: 'Enregistrement…', erreur: 'Échec de l’enregistrement : nouvel essai à la prochaine modification' };

function libellePeriode(vue, ancre, fz) {
  const f = options => new Intl.DateTimeFormat('fr-FR', { timeZone: fz, ...options });
  if (vue === 'mois') return f({ month: 'long', year: 'numeric' }).format(new Date(ancre));
  if (vue === 'jour') return f({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ancre));
  const debut = debutSemaine(ancre, fz);
  const fin = ajouterJours(debut, 6, fz);
  return `${f({ day: 'numeric', month: 'short' }).format(new Date(debut))} – ${f({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(fin))}`;
}

function barre(e, actions) {
  const aProfil = !!e.profil;
  const onglet = (cle, libelle) => h('button', {
    type: 'button', class: 'onglet', 'aria-current': e.vue === cle ? 'page' : null,
    disabled: !aProfil && cle !== 'profil', onclick: () => actions.changerVue(cle),
  }, libelle);
  const elements = [
    h('h1', { class: 'titre' }, 'Studio'),
    h('nav', { class: 'onglets', 'aria-label': 'Vues' }, onglet('semaine', 'Semaine'), onglet('mois', 'Mois'), onglet('jour', 'Jour'), onglet('bulletin', 'Bulletin'), onglet('tableau', 'Tableau de bord'), onglet('profil', 'Profil')),
  ];
  if (aProfil && e.vue !== 'profil' && e.vue !== 'tableau') {
    elements.push(h('div', { class: 'periode' },
      h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Période précédente', onclick: () => actions.naviguer(-1) }, '‹'),
      h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => actions.allerAujourdhui() }, "Aujourd'hui"),
      h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Période suivante', onclick: () => actions.naviguer(1) }, '›'),
      h('span', { class: 'periode-libelle' }, libellePeriode(e.vue, e.ancre, e.profil.regles_studio.fuseau))));
  }
  elements.push(h('span', { class: `sauvegarde sauvegarde-${e.sauvegarde}`, role: 'status' }, LIBELLES_SAUVEGARDE[e.sauvegarde]));
  return elements;
}

function contenuVue(e, actions, capacites) {
  if (!e.profil || e.vue === 'profil') return vueProfil(e, actions, capacites);
  if (e.vue === 'mois') return vueMois(e, actions);
  if (e.vue === 'jour') return vueJour(e, actions);
  if (e.vue === 'bulletin') return vueBulletin(e, actions);
  if (e.vue === 'tableau') return vueTableau(e, actions);
  return vueSemaine(e, actions);
}

export function creerRendu(racine, actions, capacites, horloge) {
  const tete = h('header', { class: 'barre' });
  const zoneErreur = h('div', { class: 'zone-erreur' });
  const vue = h('main', { class: 'vue' });
  const panneau = h('div', { class: 'zone-panneau' });
  racine.replaceChildren(tete, zoneErreur, h('div', { class: 'corps' }, vue, panneau));
  let memo = {};
  let elementVue = null;

  return function rendre(e) {
    zoneErreur.replaceChildren(e.erreur
      ? h('p', { class: 'erreur-bandeau', role: 'alert' }, e.erreur, ' ', h('button', { type: 'button', class: 'bouton-lien', onclick: () => actions.effacerErreur() }, 'Fermer'))
      : '');
    if (e.profil === undefined) {
      vue.replaceChildren(h('p', { class: 'aide' }, e.erreur ? 'Le studio ne peut pas se charger pour le moment.' : 'Chargement du studio…'));
      return;
    }
    tete.replaceChildren(...barre(e, actions));
    const e2 = { ...e, maintenant: horloge() };
    const estVueProfil = !e.profil || e.vue === 'profil';
    const reconstructionRequise = estVueProfil
      ? (memo.profil !== e.profil || memo.vue !== e.vue || memo.ancre !== e.ancre)
      : (memo.profil !== e.profil || memo.fiches !== e.fiches || memo.vue !== e.vue || memo.ancre !== e.ancre || memo.bulletin !== e.bulletin || memo.configVeille !== e.configVeille);
    if (reconstructionRequise) {
      elementVue = contenuVue(e2, actions, capacites);
      vue.replaceChildren(elementVue);
    } else if (estVueProfil && (memo.reference !== e.reference || memo.resultatReference !== e.resultatReference || memo.verificationReference !== e.verificationReference)) {
      elementVue?.mettreAJour?.(e2);
    } else if (e.vue === 'tableau' && (memo.stats !== e.stats || memo.relevesCompte !== e.relevesCompte || memo.fichesRecentes !== e.fichesRecentes)) {
      elementVue?.mettreAJour?.(e2);
    }
    const ouverte = e.profil && e.ficheOuverte ? e.fiches.find(f => f.id === e.ficheOuverte) : null;
    const panneauChange = memo.ficheOuverte !== e.ficheOuverte || memo.profil !== e.profil || (!!ouverte !== memo.panneauAffiche);
    if (panneauChange) panneau.replaceChildren(ouverte ? panneauFiche(ouverte, e.profil, actions, capacites) : '');
    racine.classList.toggle('avec-panneau', !!ouverte);
    memo = {
      profil: e.profil, fiches: e.fiches, vue: e.vue, ancre: e.ancre, ficheOuverte: e.ficheOuverte, panneauAffiche: !!ouverte,
      reference: e.reference, resultatReference: e.resultatReference, verificationReference: e.verificationReference,
      bulletin: e.bulletin, configVeille: e.configVeille,
      stats: e.stats, relevesCompte: e.relevesCompte, fichesRecentes: e.fichesRecentes,
    };
  };
}
