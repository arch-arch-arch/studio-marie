import { h } from './h.js';
import { svgBarres, svgCourbe, svgNuage, figure } from './graphiques.js';
import { seriesTableau, croissancesNettes } from '../logique/tableau-bord.js';
import { CHAMPS_COMPTE, etatReleves, formaterValeur } from '../logique/indicateurs.js';
import { debutSemaine, ajouterJours, cleSemaineIso, libelleJour } from '../logique/dates.js';
import { LIBELLES_FORMAT } from '../logique/fiche.js';

const VIDE = 'Pas encore de relevé.';
const pct = v => formaterValeur('taux_abonnes_par_vue', v);
const entier = v => formaterValeur('partages_par_post', v);

function aSaisir(fichesRecentes, stats, maintenant, fz, actions) {
  const lignes = fichesRecentes.filter(f => f.statut === 'publie').flatMap(f => {
    const e = etatReleves(f, stats.filter(s => s.fiche === f.id), maintenant);
    return e.enRetard ? [{ f, releves: ['48h', '7j'].filter(r => e[r].etat === 'a_saisir') }] : [];
  });
  return h('section', { class: 'a-saisir' }, h('h3', {}, 'Relevés à saisir'),
    lignes.length
      ? h('ul', {}, lignes.map(({ f, releves }) => h('li', {},
        h('span', {}, `${LIBELLES_FORMAT[f.format]} · ${libelleJour(f.date_heure, fz)} · ${f.accroche || 'Sans accroche'} · ${releves.map(r => (r === '48h' ? '48 h' : '7 jours')).join(' et ')}`),
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => actions.allerAFiche(f.id, f.date_heure) }, 'Ouvrir'))))
      : h('p', { class: 'aide' }, 'Tous les relevés dus sont saisis.'));
}

function releveCompte(relevesCompte, maintenant, fz, actions) {
  const cette = debutSemaine(maintenant, fz);
  const semaines = [[cette, `Cette semaine (${cleSemaineIso(cette, fz)})`], [ajouterJours(cette, -7, fz), `Semaine dernière (${cleSemaineIso(ajouterJours(cette, -7, fz), fz)})`]];
  const choix = h('select', { name: 'semaine' }, semaines.map(([v, t]) => h('option', { value: v }, t)));
  const entrees = CHAMPS_COMPTE.map(c => h('input', { type: 'number', min: '0', step: '1', inputmode: 'numeric', name: c.cle }));
  const retour = h('p', { class: 'aide', role: 'status' });
  const remplir = () => {
    const existant = relevesCompte.find(r => r.semaine === cleSemaineIso(choix.value, fz));
    CHAMPS_COMPTE.forEach((c, i) => { entrees[i].value = existant?.[c.cle] ?? ''; });
  };
  choix.addEventListener('change', remplir);
  remplir();
  const derniere = croissancesNettes(relevesCompte, fz).at(-1);
  return h('form', {
    class: 'releve-compte',
    onsubmit: async ev => {
      ev.preventDefault();
      retour.textContent = 'Enregistrement…';
      const saisie = Object.fromEntries(CHAMPS_COMPTE.map((c, i) => [c.cle, entrees[i].value]));
      const r = await actions.enregistrerReleveCompte(choix.value, saisie);
      retour.textContent = r.ok ? 'Relevé du compte enregistré.' : r.erreurs.join(' ');
    },
  },
  h('h3', {}, 'Relevé du compte'),
  derniere ? h('p', { class: 'aide' }, `Dernier relevé : ${derniere.semaine}, ${entier(derniere.abonnes)} abonnés${derniere.croissance != null ? `, croissance nette ${derniere.croissance >= 0 ? '+' : ''}${entier(derniere.croissance)}` : ''}.`) : null,
  h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Semaine'), choix),
  h('div', { class: 'grille-champs' }, CHAMPS_COMPTE.map((c, i) => h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, c.libelle), entrees[i]))),
  h('button', { type: 'submit', class: 'bouton-secondaire' }, 'Enregistrer le relevé'),
  retour);
}

function classement({ meilleurs, pires }) {
  if (!meilleurs.length) return figure('Meilleurs et pires contenus', '', VIDE);
  const ligne = s => h('li', {}, `${s.accroche || 'Sans accroche'} : ${pct(s.taux)} d’abonnés par vue, ${entier(s.partages_envois)} partages et envois`);
  const f = figure('Meilleurs et pires contenus', '', '');
  f.querySelector('.graphique-corps').replaceChildren(
    ...[h('h4', {}, 'Meilleurs'), h('ol', {}, meilleurs.map(ligne)), ...(pires.length ? [h('h4', {}, 'Pires'), h('ol', {}, pires.map(ligne))] : [])]);
  return f;
}

export function vueTableau({ profil, stats, relevesCompte, fichesRecentes = [], maintenant }, actions) {
  const r = profil.regles_studio;
  const fz = r.fuseau;
  if (stats === undefined || relevesCompte === undefined) return h('div', { class: 'tableau' }, h('p', { class: 'aide' }, 'Chargement du tableau de bord…'));
  const c = r.cibles ?? {};
  const s = seriesTableau({ stats, relevesCompte, fuseau: fz });
  const jour = iso => new Date(iso).toLocaleDateString('fr-FR', { timeZone: fz, day: 'numeric', month: 'short' });
  return h('div', { class: 'tableau' },
    h('div', { class: 'tableau-saisie' }, aSaisir(fichesRecentes, stats, maintenant, fz, actions), releveCompte(relevesCompte, maintenant, fz, actions)),
    h('div', { class: 'graphiques' },
      figure('Taux d’abonnés par vue des Reels', svgCourbe({ points: s.reels.map(p => ({ etiquette: jour(p.date), valeur: p.valeur, titre: p.libelle })), cible: c.taux_abonnes_par_vue ?? null, format: pct }), VIDE),
      figure('Partages et envois par post', svgBarres({ valeurs: s.partages.slice(-12).map(p => ({ etiquette: jour(p.date), valeur: p.valeur, titre: p.libelle })), cible: c.partages_par_post ?? null, format: entier }), VIDE),
      figure('Croissance nette hebdomadaire', svgBarres({ valeurs: s.croissance.map(p => ({ etiquette: p.semaine.slice(5), valeur: p.valeur, titre: p.semaine })), cible: c.croissance_nette_semaine ?? null, format: entier }), 'Il faut deux relevés du compte consécutifs.'),
      figure('Clics sur la porte', svgBarres({ valeurs: s.porte.map(p => ({ etiquette: p.semaine.slice(5), valeur: p.valeur, titre: p.semaine })), cible: c.clics_porte_semaine ?? null, format: entier }), VIDE),
      classement(s.classement),
      figure('Score prévu / performance réelle', svgNuage({ points: s.scoreReel.map(p => ({ x: p.score, y: p.valeur, titre: p.libelle })), formatY: pct }), 'Aucun contenu évalué et relevé.')));
}
