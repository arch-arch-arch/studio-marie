import { h } from './h.js';
import { LIBELLES_FORMAT } from '../logique/fiche.js';
import { heureLocale, libelleJour } from '../logique/dates.js';
import { bandeau } from './carte.js';
import { formaterValeur } from '../logique/indicateurs.js';

const lienRelance = config => (config?.url_routine?.startsWith('https://')
  ? h('a', { href: config.url_routine, target: '_blank', rel: 'noopener', class: 'bouton-secondaire' }, 'Relancer la veille')
  : h('p', { class: 'aide' }, 'La veille n’est pas encore configurée.'));

const ECHEC_VEILLE = 'La veille a échoué : réessaie dans quelques minutes. Rien n’a été modifié.';

function relance(config, actions, capacites) {
  if (capacites.veille === true) {
    const message = h('p', { class: 'aide', role: 'status' });
    const bouton = h('button', {
      type: 'button', class: 'bouton-secondaire',
      onclick: async () => {
        bouton.disabled = true;
        message.textContent = 'Veille en cours : cela peut prendre quelques minutes.';
        try {
          const r = await actions.relancerVeille();
          message.textContent = r.ok ? r.message : r.raison;
        } catch {
          message.textContent = ECHEC_VEILLE;
        } finally {
          bouton.disabled = false;
        }
      },
    }, 'Relancer la veille');
    return h('div', { class: 'relance' }, bouton, message);
  }
  if (capacites.veille === false) return h('p', { class: 'aide' }, 'La veille n’est pas encore configurée.');
  return lienRelance(config);
}

const source = s => (/^https?:\/\//.test(s) ? h('a', { href: s, target: '_blank', rel: 'noopener' }, s) : s);

const pct = v => formaterValeur('taux_abonnes_par_vue', v);
const contenu = (libelle, c) => (c
  ? h('p', {}, `${libelle} : « ${c.accroche || 'Sans accroche'} » (${pct(c.taux)} d’abonnés par vue, ${formaterValeur('partages_par_post', c.partages_envois)} partages et envois).`)
  : null);

function sectionRetrospective(retro) {
  const manquants = retro?.manquants ?? [];
  return h('section', {}, h('h3', {}, 'Rétrospective'),
    h('p', {}, retro?.texte ?? ''),
    retro?.type === 'bilan' ? [
      contenu('Meilleur contenu', retro.meilleur),
      contenu('Pire contenu', retro.pire),
      retro.ecarts?.length ? h('ul', { class: 'ecarts' }, retro.ecarts.map(e => h('li', { class: e.atteinte ? 'ecart-atteint' : 'ecart-sous' },
        `${e.libelle} : ${formaterValeur(e.indicateur, e.valeur)} pour une cible de ${formaterValeur(e.indicateur, e.cible)} (${e.atteinte ? 'atteinte' : 'en dessous'}).`))) : null,
    ] : null,
    manquants.length ? h('p', { class: 'aide' }, `Relevés manquants : ${manquants.map(m => `${m.accroche || 'Sans accroche'} (${m.releve === '48h' ? '48 h' : '7 jours'})`).join(', ')}.`) : null);
}

export function vueBulletin({ profil, fiches, bulletin, configVeille }, actions, capacites = {}) {
  const fz = profil.regles_studio.fuseau;
  if (bulletin === undefined) return h('div', { class: 'bulletin' }, h('p', { class: 'aide' }, 'Chargement du bulletin…'));
  if (bulletin === null) {
    return h('div', { class: 'bulletin' }, h('p', { class: 'sans-bulletin' }, 'Pas de bulletin pour cette semaine.'), relance(configVeille, actions, capacites));
  }
  const parId = new Map(fiches.map(f => [f.id, f]));
  const genere = new Date(bulletin.genere_le).toLocaleString('fr-FR', { timeZone: fz });
  return h('div', { class: 'bulletin' },
    h('header', { class: 'bulletin-tete' },
      h('h2', {}, `Semaine ${bulletin.semaine}`),
      h('p', { class: 'aide' }, `Préparé le ${genere}.`),
      relance(configVeille, actions, capacites)),
    bulletin.sources_indisponibles ? h('p', { class: 'bulletin-partiel', role: 'status' }, 'Sources indisponibles : bulletin partiel.') : null,
    sectionRetrospective(bulletin.retrospective),
    h('section', {}, h('h3', {}, 'Tendances'),
      (bulletin.tendances ?? []).length
        ? h('ul', { class: 'tendances' }, (bulletin.tendances ?? []).map(t => h('li', { class: 'tendance' },
          h('strong', {}, t.titre), t.son_a_verifier ? h('span', { class: 'etiquette' }, 'Son à vérifier dans l’app') : null,
          h('p', {}, `Pourquoi : ${t.pourquoi}`), h('p', {}, `Adaptation : ${t.adaptation}`),
          h('p', { class: 'aide' }, 'Source : ', source(t.source), ` · ${t.date} · durée de vie : ${t.duree_vie}`))))
        : h('p', { class: 'aide' }, 'Aucune tendance retenue cette semaine.')),
    bulletin.ecartees?.length
      ? h('details', {}, h('summary', {}, `Tendances écartées (${bulletin.ecartees.length})`),
        h('ul', {}, bulletin.ecartees.map(e => h('li', {}, `${e.titre} : ${e.raison}`))))
      : null,
    bulletin.alertes?.length
      ? h('section', {}, h('h3', {}, 'Alertes'), h('ul', {}, bulletin.alertes.map(a => h('li', {}, a.texte,
        a.proposition_profil ? h('p', { class: 'aide' }, `Proposition de mise à jour du profil : ${a.proposition_profil}`) : null))))
      : null,
    h('section', {}, h('h3', {}, 'Idées déposées'),
      h('ul', { class: 'idees' }, (bulletin.idees ?? []).map(id => {
        const f = parId.get(id);
        if (!f) return h('li', { class: 'aide' }, 'Idée supprimée ou hors de cette semaine.');
        return h('li', { class: 'idee' },
          h('span', {}, `${LIBELLES_FORMAT[f.format]} · ${libelleJour(f.date_heure, fz)} ${heureLocale(f.date_heure, fz)}`),
          h('span', { class: 'idee-accroche' }, f.accroche || 'Sans accroche'),
          (bulletin.hors_creneau ?? []).includes(id) ? h('span', { class: 'etiquette' }, 'Hors créneau') : null,
          h('button', { type: 'button', class: 'bouton-lien', onclick: () => actions.ouvrirFiche(id) }, 'Ouvrir'));
      }))),
    bulletin.controle?.length ? h('section', {}, h('h3', {}, 'Contrôle de la semaine au moment du bulletin'), bandeau(bulletin.controle)) : null);
}
