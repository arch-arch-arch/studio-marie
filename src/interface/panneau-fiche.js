import { h } from './h.js';
import {
  FORMATS, LIBELLES_FORMAT, STATUTS, LIBELLES_STATUT, analyserHashtags, formaterHashtags, texteAPublier, aReevaluer,
} from '../logique/fiche.js';
import { cleJour, heureLocale, depuisSaisieLocale } from '../logique/dates.js';

const ROLES = [['', '—'], ['engagement', 'Engagement'], ['cta', "Appel à l'action"], ['deadpan', 'Deadpan']];
const LIBELLES_ROLE = { engagement: 'Engagement', cta: "Appel à l'action", deadpan: 'Deadpan' };
const LIBELLES_CONFORMITE = { vert: 'conforme', orange: 'à surveiller', rouge: 'bloquante' };

export function panneauFiche(fiche, profil, actions, capacites) {
  const r = profil.regles_studio;
  const fz = r.fuseau;
  const id = fiche.id;
  let brouillon = { ...fiche };
  const racine = h('aside', { class: 'panneau', 'aria-label': 'Fiche contenu' });
  const message = h('p', { class: 'panneau-message', role: 'status' });
  const afficher = texte => { message.replaceChildren(texte ?? ''); };
  let elementStatut = null;
  let elementScore = null;
  let evaluationDisponible = capacites.sample === true;
  let controleurEvaluation = null;
  const remplacerScore = () => {
    const nouveau = sectionScore();
    elementScore.replaceWith(nouveau);
    elementScore = nouveau;
  };

  async function evaluer() {
    if (controleurEvaluation) return;
    controleurEvaluation = new AbortController();
    remplacerScore();
    afficher('Évaluation en cours : cela peut prendre jusqu’à une minute.');
    let resultat;
    try {
      resultat = await actions.evaluerFiche(id, { signal: controleurEvaluation.signal });
    } catch {
      controleurEvaluation = null;
      remplacerScore();
      afficher('L’évaluation a échoué : réessaie. Rien n’a été modifié.');
      return;
    }
    controleurEvaluation = null;
    if (resultat.ok) {
      const { score, variantes, suggestions, recommandations } = resultat.fiche;
      brouillon = { ...brouillon, score, variantes, suggestions, recommandations };
      remplacerScore();
      afficher('Évaluation terminée.');
      appliquerStatutRenvoye(resultat.fiche.statut);
      return;
    }
    if (resultat.indisponible) evaluationDisponible = false;
    remplacerScore();
    afficher(resultat.annule ? 'Évaluation arrêtée.' : resultat.raison);
  }

  const SELECTEURS_CHAMP = { caption: 'textarea[name="caption"]', accroche: 'textarea[name="accroche"]', hashtags: 'input[name="hashtags"]' };
  const valeurChamp = champ => (champ === 'hashtags' ? formaterHashtags(brouillon.hashtags) : brouillon[champ]);

  const utiliser = (changements, messageFait, champ) => {
    afficher(messageFait);
    changer(changements);
    const controle = racine.querySelector(SELECTEURS_CHAMP[champ]);
    if (controle) controle.value = valeurChamp(champ);
    remplacerScore();
    controle?.focus();
  };

  const appliquerStatutRenvoye = statut => {
    if (statut == null || statut === brouillon.statut) return;
    brouillon = { ...brouillon, statut };
    const nouvelElement = sectionStatut();
    elementStatut.replaceWith(nouvelElement);
    elementStatut = nouvelElement;
    afficher('La fiche est repassée en Brouillon : réévalue-la.');
  };
  const changer = changements => {
    brouillon = { ...brouillon, ...changements };
    const resultat = actions.modifierFiche(id, changements);
    if (resultat != null) appliquerStatutRenvoye(resultat.statut);
  };

  const champ = (libelle, controle) => h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, libelle), controle);
  const selection = (nom, valeur, options, surChange) => h('select', { name: nom, onchange: e => surChange(e.target.value) },
    options.map(([v, t]) => h('option', { value: v, selected: v === (valeur ?? '') }, t)));
  const caseACocher = (libelle, cle) => h('label', { class: 'case' },
    h('input', { type: 'checkbox', name: cle, checked: !!brouillon[cle], onchange: e => changer({ [cle]: e.target.checked }) }),
    libelle);

  async function copier() {
    const texte = texteAPublier(brouillon);
    try {
      await navigator.clipboard.writeText(texte);
      afficher('Copié. Colle-le dans Meta Business Suite.');
    } catch {
      const secours = h('textarea', { class: 'secours-copie', readonly: true, rows: 5, value: texte });
      message.replaceChildren('La copie automatique est bloquée : sélectionne le texte ci-dessous.', secours);
      secours.select();
    }
  }

  async function envoyer(fichier) {
    if (!fichier) return;
    if (!/^(image|video)\//.test(fichier.type ?? '')) { afficher('Choisis une image ou une vidéo.'); return; }
    afficher('Téléversement…');
    const resultat = await actions.televerserVisuel(id, fichier);
    if (!resultat.ok) { afficher(resultat.raison); return; }
    brouillon = { ...brouillon, visuel: resultat.id, visuel_type: resultat.type };
    construire();
    afficher('Visuel ajouté.');
    appliquerStatutRenvoye(resultat.statut);
  }

  const sectionStatut = () => h('div', { class: 'statuts', role: 'group', 'aria-label': 'Statut' },
    STATUTS.map(s => h('button', {
      type: 'button', class: s === brouillon.statut ? 'statut-bouton actif' : 'statut-bouton', 'aria-pressed': String(s === brouillon.statut),
      onclick: async () => {
        const v = await actions.changerStatut(id, s);
        if (!v.ok) { afficher(v.raison); return; }
        brouillon = { ...brouillon, statut: s };
        construire();
        afficher('');
      },
    }, LIBELLES_STATUT[s])));

  const sectionType = () => h('div', { class: 'grille-champs' },
    champ('Format', selection('format', brouillon.format, FORMATS.map(f => [f, LIBELLES_FORMAT[f]]), v => {
      changer(v === 'story' ? { format: v } : { format: v, porte: false });
      construire();
    })),
    champ('Pilier', selection('pilier', brouillon.pilier, r.piliers.map(p => [p.cle, p.nom]), v => changer({ pilier: v }))),
    champ('Format validé', h('input', { type: 'text', name: 'format_valide', value: brouillon.format_valide, oninput: e => changer({ format_valide: e.target.value }) })),
    champ('Rôle de la caption', selection('role_caption', brouillon.role_caption, ROLES, v => changer({ role_caption: v || null }))),
    h('div', { class: 'cases' },
      caseACocher("Appel à l'action", 'cta'),
      caseACocher('Ragebait', 'ragebait'),
      brouillon.format === 'story' ? caseACocher('Mène à la porte', 'porte') : null));

  const sectionDate = () => {
    const date = h('input', { type: 'date', name: 'date', value: cleJour(brouillon.date_heure, fz), required: true });
    const heure = h('input', { type: 'time', name: 'heure', value: heureLocale(brouillon.date_heure, fz), required: true });
    const maj = () => { if (date.value && heure.value) changer({ date_heure: depuisSaisieLocale(date.value, heure.value, fz) }); };
    date.addEventListener('change', maj);
    heure.addEventListener('change', maj);
    return h('div', { class: 'grille-champs' }, champ('Date', date), champ(`Heure (${fz})`, heure));
  };

  const sectionVisuel = () => {
    if (!capacites.assets) return h('p', { class: 'aide' }, 'Le téléversement de visuels n’est pas disponible dans cette vue.');
    const source = brouillon.visuel ? `/_blob/${brouillon.visuel}` : null;
    const apercu = !source ? null : brouillon.visuel_type === 'video'
      ? h('video', { class: 'apercu', src: source, controls: true })
      : h('img', { class: 'apercu', src: source, alt: 'Visuel de la fiche' });
    return h('div', {
      class: 'zone-visuel',
      ondragover: e => e.preventDefault(),
      ondrop: e => { e.preventDefault(); e.stopPropagation(); envoyer(e.dataTransfer?.files?.[0]); },
    },
    apercu,
    h('label', { class: 'bouton-secondaire' },
      brouillon.visuel ? 'Remplacer le visuel' : 'Glisse un visuel ici ou choisis un fichier',
      h('input', { type: 'file', accept: 'image/*,video/*', onchange: e => envoyer(e.target.files?.[0]) })));
  };

  const sectionTexte = () => h('div', { class: 'textes' },
    champ('Accroche', h('textarea', { name: 'accroche', rows: 2, value: brouillon.accroche, oninput: e => changer({ accroche: e.target.value }) })),
    champ('Caption', h('textarea', { name: 'caption', rows: 6, value: brouillon.caption, oninput: e => changer({ caption: e.target.value }) })),
    champ('Hashtags', h('input', { type: 'text', name: 'hashtags', placeholder: '#mot #autre', value: formaterHashtags(brouillon.hashtags), onchange: e => changer({ hashtags: analyserHashtags(e.target.value) }) })),
    champ('Géotag (ville)', h('input', { type: 'text', name: 'geotag', value: brouillon.geotag, oninput: e => changer({ geotag: e.target.value }) })),
    h('button', { type: 'button', class: 'bouton-principal', onclick: copier }, 'Copier la caption et les hashtags'));

  const sectionScore = () => {
    const s = brouillon.score;
    const enfants = [h('h3', {}, s ? `Score : ${s.total}/100` : 'Score')];
    if (!s) enfants.push(h('p', { class: 'aide' }, 'Pas encore évaluée.'));
    if (s) {
      if (aReevaluer(brouillon)) enfants.push(h('p', { class: 'aide' }, 'La fiche a changé depuis son évaluation : réévalue-la.'));
      const etat = s.conformite?.etat;
      const causes = s.conformite?.causes ?? [];
      enfants.push(h('p', { class: `conformite conformite-${etat}` },
        `Conformité : ${LIBELLES_CONFORMITE[etat] ?? 'non évaluée'}.`, causes.length ? ` ${causes.join(' ; ')}` : ''));
      enfants.push(h('ul', { class: 'criteres' }, (s.criteres ?? []).map(c => h('li', {}, `${c.nom} : ${c.points}/${c.max}. ${c.phrase ?? ''}`))));
      if (s.alertes?.length) enfants.push(h('h4', {}, 'Alertes'), h('ul', { class: 'alertes' }, s.alertes.map(a => h('li', {}, a))));
    }
    if (brouillon.recommandations?.length) {
      enfants.push(h('h4', {}, 'Recommandations'), h('ol', { class: 'recommandations' }, brouillon.recommandations.map(r => h('li', {}, r))));
    }
    if (brouillon.variantes?.length) {
      enfants.push(h('h4', {}, 'Captions proposées'), h('ul', { class: 'suggestions' }, brouillon.variantes.map(v => h('li', { class: 'suggestion' },
        h('span', { class: 'suggestion-role' }, LIBELLES_ROLE[v.role] ?? v.role), h('span', { class: 'suggestion-texte' }, v.texte),
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => utiliser({ caption: v.texte }, 'Caption remplacée.', 'caption') }, 'Utiliser')))));
    }
    if (brouillon.suggestions?.accroches?.length) {
      enfants.push(h('h4', {}, 'Accroches proposées'), h('ul', { class: 'suggestions' }, brouillon.suggestions.accroches.map(a => h('li', { class: 'suggestion' },
        h('span', { class: 'suggestion-texte' }, a),
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => utiliser({ accroche: a }, 'Accroche remplacée.', 'accroche') }, 'Utiliser')))));
    }
    if (brouillon.suggestions?.hashtags?.length) {
      enfants.push(h('p', { class: 'suggestion-hashtags' }, formaterHashtags(brouillon.suggestions.hashtags), ' ',
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => utiliser({ hashtags: brouillon.suggestions.hashtags }, 'Hashtags remplacés.', 'hashtags') }, 'Utiliser ces hashtags')));
    }
    if (evaluationDisponible) {
      enfants.push(controleurEvaluation
        ? h('div', { class: 'evaluation-actions' },
          h('button', { type: 'button', class: 'bouton-principal', disabled: true }, 'Évaluation…'),
          h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => controleurEvaluation?.abort() }, 'Arrêter'))
        : h('div', { class: 'evaluation-actions' },
          h('button', { type: 'button', class: 'bouton-principal', onclick: evaluer }, s ? 'Réévaluer' : 'Évaluer')));
    }
    return h('section', { class: 'score' }, enfants);
  };

  const sectionSuppression = () => {
    const zone = h('div', { class: 'suppression' });
    const initial = () => h('button', { type: 'button', class: 'bouton-lien', onclick: demander }, 'Supprimer la fiche');
    function demander() {
      zone.replaceChildren(
        h('span', {}, 'Supprimer définitivement cette fiche ?'),
        h('button', { type: 'button', class: 'bouton-danger', onclick: () => actions.supprimerFiche(id) }, 'Oui, supprimer'),
        h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => zone.replaceChildren(initial()) }, 'Annuler'));
    }
    zone.append(initial());
    return zone;
  };

  function construire() {
    elementStatut = sectionStatut();
    elementScore = sectionScore();
    racine.replaceChildren(
      h('header', { class: 'panneau-tete' },
        h('h2', {}, LIBELLES_FORMAT[brouillon.format]),
        h('button', { type: 'button', class: 'fermer', 'aria-label': 'Fermer la fiche', onclick: () => actions.fermerPanneau() }, '×')),
      elementStatut, sectionType(), sectionDate(), sectionVisuel(), sectionTexte(), elementScore, message, sectionSuppression());
  }

  construire();
  return racine;
}
