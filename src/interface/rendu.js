import { h } from './h.js';
import { debutSemaine, ajouterJours } from '../logique/dates.js';
import { vueSemaine } from './vue-semaine.js';
import { vueMois } from './vue-mois.js';
import { vueJour } from './vue-jour.js';
import { vueProfil, sectionSauvegarde } from './vue-profil.js';
import { vueBulletin } from './vue-bulletin.js';
import { vueTableau } from './vue-tableau.js';
import { panneauFiche } from './panneau-fiche.js';
import { panneauAnalyse } from './panneau-analyse.js';

const LIBELLES_SAUVEGARDE = { ok: 'Enregistré', en_cours: 'Enregistrement…', erreur: 'Échec de l’enregistrement : nouvel essai à la prochaine modification' };

function libellePeriode(vue, ancre, fz) {
  const f = options => new Intl.DateTimeFormat('fr-FR', { timeZone: fz, ...options });
  if (vue === 'mois') return f({ month: 'long', year: 'numeric' }).format(new Date(ancre));
  if (vue === 'jour') return f({ weekday: 'long', day: 'numeric', month: 'long' }).format(new Date(ancre));
  const debut = debutSemaine(ancre, fz);
  const fin = ajouterJours(debut, 6, fz);
  return `${f({ day: 'numeric', month: 'short' }).format(new Date(debut))} – ${f({ day: 'numeric', month: 'short', year: 'numeric' }).format(new Date(fin))}`;
}

const champActif = () => {
  const el = typeof document !== 'undefined' ? document.activeElement : null;
  return !!el && (['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.isContentEditable === true);
};

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

function contenuVue(e, actions, capacites, extras) {
  if (!e.profil || e.vue === 'profil') return vueProfil(e, actions, capacites, extras);
  if (e.vue === 'mois') return vueMois(e, actions, capacites);
  if (e.vue === 'jour') return vueJour(e, actions);
  if (e.vue === 'bulletin') return vueBulletin(e, actions, capacites);
  if (e.vue === 'tableau') return vueTableau(e, actions);
  return vueSemaine(e, actions, capacites);
}

export function creerRendu(racine, actions, capacites, horloge) {
  const tete = h('header', { class: 'barre' });
  const zoneErreur = h('div', { class: 'zone-erreur' });
  const vue = h('main', { class: 'vue' });
  const zoneAnalyse = h('div', { class: 'zone-analyse' });
  const panneau = h('div', { class: 'zone-panneau' });
  racine.replaceChildren(tete, zoneErreur, zoneAnalyse, h('div', { class: 'corps' }, vue, panneau));
  let elementSauvegarde = null;
  const sauvegarde = () => (elementSauvegarde ??= sectionSauvegarde(actions, capacites));
  let memo = {};
  // État ouvert de « Avis sur la période », par période : la vue est reconstruite à chaque frappe dans une fiche.
  const avisOuverts = new Map();
  let elementVue = null;
  let boutonOuvreur = 0;

  return function rendre(e) {
    zoneErreur.replaceChildren(e.erreur
      ? h('p', { class: 'erreur-bandeau', role: 'alert' }, e.erreur, ' ', h('button', { type: 'button', class: 'bouton-lien', onclick: () => actions.effacerErreur() }, 'Fermer'))
      : '');
    if (e.profil === undefined) {
      vue.replaceChildren(h('p', { class: 'aide' }, e.erreur ? 'Le studio ne peut pas se charger pour le moment.' : 'Chargement du studio…'));
      return;
    }
    tete.replaceChildren(...barre(e, actions));
    const e2 = { ...e, maintenant: horloge(), avisOuverts };
    const estVueProfil = !e.profil || e.vue === 'profil';
    const estVueTableau = !estVueProfil && e.vue === 'tableau';
    // vueTableau affiche « Chargement du tableau de bord… » (sans mettreAJour) tant que stats ou
    // relevesCompte ne sont pas encore arrivés. Il faut reconstruire pour en sortir, sans quoi
    // mettreAJour?.() ne fait rien et l'écran reste bloqué sur le message de chargement.
    const sortDuChargementTableau = estVueTableau
      && (memo.stats === undefined || memo.relevesCompte === undefined) && e.stats !== undefined && e.relevesCompte !== undefined;
    const panneauOuvert = e.analyse != null;
    let reconstructionRequise;
    if (estVueProfil) {
      reconstructionRequise = memo.profil !== e.profil || memo.vue !== e.vue || memo.ancre !== e.ancre;
    } else if (estVueTableau) {
      // vueTableau ne lit ni fiches, ni bulletin, ni configVeille : ils ne doivent pas la reconstruire.
      reconstructionRequise = memo.profil !== e.profil || memo.vue !== e.vue || memo.ancre !== e.ancre || sortDuChargementTableau;
    } else {
      reconstructionRequise = memo.profil !== e.profil || memo.fiches !== e.fiches || memo.vue !== e.vue || memo.ancre !== e.ancre || memo.bulletin !== e.bulletin || memo.configVeille !== e.configVeille || memo.veille !== e.veille
        || (e.vue === 'semaine' && memo.stats !== e.stats)
        // Le bouton d'analyse et l'avis de la période n'existent qu'en Semaine et en Mois ; le panneau d'analyse, lui, n'en dépend pas.
        || ((e.vue === 'semaine' || e.vue === 'mois') && (memo.analyses !== e.analyses || memo.panneauOuvert !== panneauOuvert));
    }
    if (reconstructionRequise) {
      elementVue = contenuVue(e2, actions, capacites, { sauvegarde: sauvegarde() });
      vue.replaceChildren(elementVue);
    } else if (estVueProfil && (memo.reference !== e.reference || memo.resultatReference !== e.resultatReference || memo.verificationReference !== e.verificationReference)) {
      elementVue?.mettreAJour?.(e2);
    } else if (estVueTableau && (memo.stats !== e.stats || memo.relevesCompte !== e.relevesCompte || memo.fichesRecentes !== e.fichesRecentes)) {
      elementVue?.mettreAJour?.(e2);
    }
    // Le panneau d'analyse garde le texte collé : il n'est reconstruit que si le dossier, l'étape ou le message changent.
    const cleAnalyse = e.analyse ? [e.analyse.etape, e.analyse.code ?? '', e.analyse.message ?? ''].join('|') : null;
    if (cleAnalyse !== memo.cleAnalyse) {
      const ouvertureAnalyse = !memo.cleAnalyse;
      // La préparation qui se termine remplace le panneau : le focus qu'il portait (ou personne) passe au nouveau titre.
      const prepareeTerminee = memo.etapeAnalyse === 'preparation' && ['pret', 'erreur'].includes(e.analyse?.etape);
      const actif = typeof document !== 'undefined' ? document.activeElement : null;
      const focusAuPanneau = !actif || actif === document.body || zoneAnalyse.contains(actif);
      const elementAnalyse = e.analyse ? panneauAnalyse(e.analyse, actions, { partage: e.analyse.etape === 'pret' && !!actions.peutPartagerDossier?.() }) : null;
      zoneAnalyse.replaceChildren(...(elementAnalyse ? [elementAnalyse] : []));
      if (elementAnalyse) {
        if (ouvertureAnalyse) {
          // « Coller un retour » est le second bouton de la rangée, « Analyser… » le premier.
          boutonOuvreur = e.analyse.etape === 'retour' ? 1 : 0;
          if (!champActif()) elementAnalyse.querySelector('h2')?.focus({ preventScroll: true });
          if (typeof elementAnalyse.scrollIntoView === 'function') elementAnalyse.scrollIntoView({ block: 'nearest' });
        } else if (prepareeTerminee && focusAuPanneau) {
          elementAnalyse.querySelector('h2')?.focus({ preventScroll: true });
        }
      } else {
        vue.querySelectorAll('.analyse-periode button')[boutonOuvreur]?.focus();
      }
    }
    const ouverte = e.profil && e.ficheOuverte ? e.fiches.find(f => f.id === e.ficheOuverte) : null;
    const panneauChange = memo.ficheOuverte !== e.ficheOuverte || memo.profil !== e.profil || (!!ouverte !== memo.panneauAffiche);
    if (panneauChange) panneau.replaceChildren(ouverte ? panneauFiche(ouverte, e.profil, actions, capacites, (e.stats ?? []).filter(s => s.fiche === ouverte.id)) : '');
    racine.classList.toggle('avec-panneau', !!ouverte);
    memo = {
      profil: e.profil, fiches: e.fiches, vue: e.vue, ancre: e.ancre, ficheOuverte: e.ficheOuverte, panneauAffiche: !!ouverte,
      cleAnalyse, etapeAnalyse: e.analyse?.etape ?? null, analyses: e.analyses, panneauOuvert,
      reference: e.reference, resultatReference: e.resultatReference, verificationReference: e.verificationReference,
      bulletin: e.bulletin, configVeille: e.configVeille, veille: e.veille,
      stats: e.stats, relevesCompte: e.relevesCompte, fichesRecentes: e.fichesRecentes,
    };
  };
}
