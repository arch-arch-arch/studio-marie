import { h } from './h.js';
import { nomAssistant } from '../logique/score.js';

const s = n => (n > 1 ? 's' : '');
const MO = 1024 * 1024;
const POIDS_LOURD = 25 * MO;
const LONGUEUR_MAX_RETOUR = 400000;

export function rangeeAnalyse(libelle, analyse, actions) {
  return h('div', { class: 'rangee analyse-periode' },
    h('button', { type: 'button', class: 'bouton-secondaire', disabled: analyse?.etape === 'preparation', onclick: () => actions.ouvrirAnalyse() }, libelle));
}

function lignePoids(fichier) {
  const octets = fichier?.size;
  if (!Number.isFinite(octets)) return null;
  if (octets > POIDS_LOURD) {
    return h('p', { class: 'avertissement' }, `Dossier lourd (${Math.round(octets / MO)} Mo) : l’assistant peut le refuser. Analyse une période plus courte si l’envoi échoue.`);
  }
  return h('p', { class: 'aide' }, `Dossier prêt (${(octets / MO).toFixed(1).replace('.', ',')} Mo).`);
}

export function panneauAnalyse(analyse, actions, capacites = {}) {
  const fermer = h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => actions.fermerAnalyse() }, 'Fermer');
  const titre = h('h2', { tabindex: '-1' }, 'Analyse par Claude ou ChatGPT');
  if (analyse.etape === 'preparation') {
    return h('section', { class: 'panneau-analyse' }, titre, h('p', { class: 'aide', role: 'status' }, 'Préparation du dossier…'), fermer);
  }
  if (analyse.etape === 'erreur') {
    return h('section', { class: 'panneau-analyse' }, titre, h('p', { class: 'erreur', role: 'alert' }, analyse.message), fermer);
  }
  const etat = h('p', { class: 'aide etat-action', role: 'status' });
  const zoneMessage = h('div', {});
  const agir = action => async () => {
    let r;
    try { r = await action(); } catch { r = { ok: false, message: 'L’action a échoué : réessaie.' }; }
    etat.textContent = r.message;
    if (!r.ok && action === actions.copierMessage) {
      etat.textContent = '';
      zoneMessage.replaceChildren(h('p', { class: 'aide' }, 'Copie ce message à la main :'), h('textarea', { class: 'message-a-copier', readonly: true, rows: 3 }, r.message));
    } else if (r.ok) zoneMessage.replaceChildren();
  };
  const lien = (libelle, href, nom) => h('a', { href, target: '_blank', rel: 'noopener noreferrer', class: 'bouton-secondaire', onclick: () => actions.noterAssistant(nom) }, libelle);

  const retour = h('textarea', { class: 'retour', rows: 6, placeholder: 'Colle ici toute la réponse de l’assistant' });
  const statutRetour = h('p', { role: 'status' });
  const erreurRetour = h('p', { class: 'erreur', role: 'alert' });
  const detailRetour = h('div', { class: 'detail-retour' });
  const enregistrer = h('button', {
    type: 'button', class: 'bouton-principal',
    onclick: async () => {
      if (enregistrer.disabled) return;
      erreurRetour.textContent = '';
      if (!retour.value.trim()) { erreurRetour.textContent = 'Colle d’abord la réponse de l’assistant.'; return; }
      if (retour.value.length > LONGUEUR_MAX_RETOUR) { erreurRetour.textContent = 'Ce texte est trop long : copie seulement la réponse de l’assistant.'; return; }
      enregistrer.disabled = true;
      statutRetour.textContent = 'Enregistrement…';
      detailRetour.replaceChildren();
      let r;
      try { r = await actions.enregistrerRetour(retour.value); }
      catch { r = { ok: false, raison: 'L’enregistrement a échoué : réessaie.' }; }
      enregistrer.disabled = false;
      if (!r.ok) { statutRetour.textContent = ''; erreurRetour.textContent = r.raison; return; }
      statutRetour.textContent = `${r.appliquees} fiche${s(r.appliquees)} mise${s(r.appliquees)} à jour.`;
      const ecartees = r.ecartees ?? [];
      detailRetour.replaceChildren(...[
        r.avisRecu ? null : h('p', { class: 'aide' }, 'L’avis d’ensemble manquait dans la réponse.'),
        ecartees.length ? h('ul', { class: 'ecartees' }, ecartees.map(e => h('li', {}, `${e.ref} : ${e.raison}${e.detail ? ` (${e.detail})` : ''}`))) : null,
      ].filter(Boolean));
    },
  }, 'Enregistrer le retour');

  return h('section', { class: 'panneau-analyse' },
    titre,
    h('p', {}, `${analyse.nombre} fiche${s(analyse.nombre)}, ${analyse.periode.libelle}.`),
    lignePoids(analyse.fichier),
    analyse.sansVisuel?.length ? h('p', { class: 'aide' }, `Sans visuel dans le dossier : ${analyse.sansVisuel.join(', ')}.`) : null,
    h('h3', {}, '1. Donne le dossier à ton assistant'),
    h('div', { class: 'rangee' },
      capacites.partage ? h('button', { type: 'button', class: 'bouton-principal', onclick: agir(actions.partagerDossier) }, 'Partager le dossier') : null,
      h('button', { type: 'button', class: capacites.partage ? 'bouton-secondaire' : 'bouton-principal', onclick: agir(actions.telechargerDossier) }, 'Télécharger le dossier'),
      h('button', { type: 'button', class: 'bouton-secondaire', onclick: agir(actions.copierMessage) }, 'Copier le message')),
    h('div', { class: 'rangee' }, lien('Ouvrir Claude', 'https://claude.ai/new', 'claude'), lien('Ouvrir ChatGPT', 'https://chatgpt.com/', 'chatgpt')),
    etat, zoneMessage,
    h('p', { class: 'aide' }, 'Dans le chat : joins le dossier, colle le message, envoie. Tu peux discuter de l’analyse avant de revenir ici.'),
    h('h3', {}, '2. Colle sa réponse'),
    retour,
    h('div', { class: 'rangee' }, enregistrer),
    statutRetour, erreurRetour, detailRetour,
    fermer);
}

export function sectionAvis(analyses, periode, fiches) {
  const dernier = (analyses ?? [])
    .filter(a => a.periode?.type === periode.type && a.periode?.cle === periode.cle && a.retour?.avis)
    .sort((x, y) => String(y.retour.recu_le).localeCompare(String(x.retour.recu_le)))[0];
  if (!dernier) return null;
  const r = dernier.retour;
  const parRef = new Map((dernier.fiches ?? []).map(f => [f.ref, (fiches ?? []).find(x => x.id === f.id)]));
  const libelle = ref => { const f = parRef.get(ref); return f ? `${ref} · ${f.accroche || 'sans accroche'}` : ref; };
  const date = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'long' }).format(new Date(r.recu_le));
  const liste = (titre, xs) => (xs?.length ? [h('h4', {}, titre), h('ul', {}, xs.map(x => h('li', {}, x)))] : null);
  const nonNotees = r.ecartees?.length ?? 0;
  return h('details', { class: 'avis-periode' },
    h('summary', {}, periode.type === 'mois' ? 'Avis sur le mois' : 'Avis sur la semaine'),
    h('p', { class: 'aide' }, `Avis de ${nomAssistant({ source: 'dossier', assistant: dernier.assistant })}, reçu le ${date}. Avis d’expert, pas une prédiction de performance.`),
    h('p', {}, r.avis),
    nonNotees ? h('p', { class: 'aide' }, `${nonNotees} fiche${s(nonNotees)} non notée${s(nonNotees)} lors de ce retour.`) : null,
    liste('Points forts', r.points_forts), liste('Risques', r.risques),
    r.ordre_conseille?.length ? [h('h4', {}, 'Ordre conseillé'), h('ol', {}, r.ordre_conseille.map(ref => h('li', {}, libelle(ref))))] : null);
}
