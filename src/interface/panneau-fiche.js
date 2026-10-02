import { h } from './h.js';
import {
  FORMATS, LIBELLES_FORMAT, STATUTS, LIBELLES_STATUT, analyserHashtags, formaterHashtags, texteAPublier, aReevaluer, effacementsPour,
} from '../logique/fiche.js';
import { cleJour, heureLocale, depuisSaisieLocale } from '../logique/dates.js';
import { RELEVES, CHAMPS_CONTENU, etatReleves, tauxAbonnesParVue, formaterValeur } from '../logique/indicateurs.js';
import { prochaineAction, ACTIONS_SANS_SUITE } from '../logique/parcours.js';
import { lignesExamen, nomAssistant } from '../logique/score.js';

const ROLES = [['', '—'], ['engagement', 'Engagement'], ['cta', "Appel à l'action"], ['deadpan', 'Deadpan']];
const LIBELLES_ROLE = { engagement: 'Engagement', cta: "Appel à l'action", deadpan: 'Deadpan' };
const LIBELLES_CONFORMITE = { vert: 'conforme', orange: 'à surveiller', rouge: 'bloquante' };
const LIBELLES_RELEVE = { '48h': 'Relevé à 48 h', '7j': 'Relevé à 7 jours' };

export function panneauFiche(fiche, profil, actions, capacites, releves = []) {
  const r = profil.regles_studio;
  const fz = r.fuseau;
  const id = fiche.id;
  let brouillon = { ...fiche };
  let relevesConnus = releves;
  let elementAction = null;
  const zoneConfirmation = h('div', { class: 'zone-confirmation' });
  const maintenant = () => actions.maintenant?.() ?? new Date().toISOString();
  const arrondiMinute = iso => new Date(Math.floor(Date.parse(iso) / 60000) * 60000).toISOString();
  const racine = h('aside', { class: 'panneau', 'aria-label': 'Fiche contenu' });
  const message = h('p', { class: 'panneau-message', role: 'status' });
  const afficher = texte => { message.replaceChildren(texte ?? ''); };
  let elementStatut = null;
  let elementScore = null;
  let evaluationDisponible = capacites.sample === true && (actions.evaluationDisponible?.() ?? true);
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
      majAction();
      afficher('L’évaluation a échoué : réessaie. Rien n’a été modifié.');
      return;
    }
    controleurEvaluation = null;
    if (resultat.ok) {
      const { score, variantes, suggestions, recommandations } = resultat.fiche;
      brouillon = { ...brouillon, score, variantes, suggestions, recommandations };
      remplacerScore();
      majAction();
      afficher('Évaluation terminée.');
      appliquerStatutRenvoye(resultat.fiche.statut);
      return;
    }
    if (resultat.indisponible) evaluationDisponible = false;
    remplacerScore();
    majAction();
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
    brouillon = { ...brouillon, statut, ...effacementsPour(statut) };
    const nouvelElement = sectionStatut();
    elementStatut.replaceWith(nouvelElement);
    elementStatut = nouvelElement;
    majAction();
    afficher('La fiche est repassée en Brouillon : réévalue-la.');
  };
  const changer = changements => {
    brouillon = { ...brouillon, ...changements };
    const resultat = actions.modifierFiche(id, changements);
    if (resultat != null) appliquerStatutRenvoye(resultat.statut);
    majAction();
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

  const LIBELLES_BOUTON_ACTION = {
    evaluer: 'Lancer l’évaluation', reevaluer: 'Lancer l’évaluation', programmer: 'Confirmer…', reconfirmer: 'Confirmer…',
    publier: 'Confirmer…', stats: 'Aller aux statistiques', valider: 'Passer en Validé',
  };

  const sectionAction = () => {
    const a = prochaineAction(brouillon, relevesConnus, maintenant(), fz);
    const surClic = {
      evaluer: evaluationDisponible ? () => evaluer() : null,
      reevaluer: evaluationDisponible ? () => evaluer() : null,
      programmer: () => ouvrirConfirmation('programme'),
      reconfirmer: () => ouvrirConfirmation('programme'),
      publier: () => ouvrirConfirmation('publie'),
      stats: () => racine.querySelector('.stats-fiche')?.scrollIntoView?.({ behavior: 'smooth', block: 'start' }),
      valider: () => passerA('valide'),
    }[a.cle] ?? null;
    const classes = ['prochaine-action', a.retard ? 'action-retard' : '', ACTIONS_SANS_SUITE.has(a.cle) ? 'action-calme' : ''].filter(Boolean).join(' ');
    return h('div', { class: classes, 'data-action': a.cle },
      h('strong', { class: 'prochaine-action-libelle' }, a.libelle),
      a.detail ? h('span', { class: 'aide' }, a.detail) : null,
      surClic ? h('button', { type: 'button', class: 'bouton-principal', onclick: surClic }, LIBELLES_BOUTON_ACTION[a.cle]) : null);
  };

  const majAction = () => {
    if (!elementAction) return;
    const nouveau = sectionAction();
    elementAction.replaceWith(nouveau);
    elementAction = nouveau;
  };

  async function passerA(s) {
    const v = await actions.changerStatut(id, s);
    if (!v.ok) { afficher(v.raison); return; }
    brouillon = { ...brouillon, statut: s, ...effacementsPour(s) };
    zoneConfirmation.replaceChildren();
    construire();
    afficher('');
  }

  function ouvrirConfirmation(type) {
    const publication = type === 'publie';
    const m = maintenant();
    const defaut = publication ? (brouillon.date_heure <= m ? brouillon.date_heure : arrondiMinute(m)) : brouillon.date_heure;
    const date = h('input', { type: 'date', name: 'confirmation-date', value: cleJour(defaut, fz) });
    const heure = h('input', { type: 'time', name: 'confirmation-heure', value: heureLocale(defaut, fz) });
    const coche = h('input', { type: 'checkbox', name: 'confirmation-coche' });
    const retour = h('p', { class: 'aide', role: 'status' });
    const titre = publication ? 'Confirmer la publication' : 'Confirmer la programmation';
    const boutonEnvoyer = h('button', { type: 'submit', class: 'bouton-principal' }, titre);
    const form = h('form', {
      class: `confirmation confirmation-${type}`,
      onsubmit: async ev => {
        ev.preventDefault();
        if (!date.value || !heure.value) { retour.textContent = 'Indique la date et l’heure.'; return; }
        const iso = depuisSaisieLocale(date.value, heure.value, fz);
        boutonEnvoyer.disabled = true;
        const res = publication
          ? await actions.confirmerPublication(id, iso, coche.checked)
          : await actions.confirmerProgrammation(id, iso, coche.checked);
        if (!res.ok) { boutonEnvoyer.disabled = false; retour.textContent = res.raison; return; }
        brouillon = { ...brouillon, ...res.fiche };
        zoneConfirmation.replaceChildren();
        construire();
        afficher(publication ? 'Publication confirmée.' : 'Programmation confirmée.');
      },
    },
    h('h3', {}, titre),
    h('div', { class: 'grille-champs' },
      champ(publication ? 'Date de publication' : 'Date programmée', date),
      champ(`Heure (${fz})`, heure)),
    h('label', { class: 'case' }, coche, publication ? 'Le contenu est en ligne' : 'J’ai programmé ce contenu dans Meta Business Suite'),
    h('div', { class: 'evaluation-actions' },
      boutonEnvoyer,
      h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => zoneConfirmation.replaceChildren() }, 'Annuler')),
    retour);
    zoneConfirmation.replaceChildren(form);
  }

  const sectionStatut = () => h('div', { class: 'statuts', role: 'group', 'aria-label': 'Statut' },
    STATUTS.map(s => h('button', {
      type: 'button', class: s === brouillon.statut ? 'statut-bouton actif' : 'statut-bouton', 'aria-pressed': String(s === brouillon.statut),
      onclick: () => (s === 'programme' || s === 'publie' ? ouvrirConfirmation(s) : passerA(s)),
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
    let apercu = null;
    if (brouillon.visuel) {
      apercu = brouillon.visuel_type === 'video'
        ? h('video', { class: 'apercu', controls: true })
        : h('img', { class: 'apercu', alt: 'Visuel de la fiche' });
      if (typeof actions.urlVisuel === 'function') {
        let avis = null;
        let redemande = false;
        const echec = e => {
          if (avis) return;
          avis = h('p', { class: 'aide', role: 'status' }, e?.code === 'not_found' ? 'Visuel introuvable.' : 'Visuel indisponible pour l’instant : réessaie.');
          apercu.after(avis);
        };
        const charger = () => actions.urlVisuel(brouillon.visuel).then(url => { apercu.setAttribute('src', url); }, echec);
        // Le lien signé dure une heure : une seule nouvelle demande si l'aperçu échoue.
        apercu.addEventListener('error', () => {
          if (redemande) { echec(null); return; }
          redemande = true;
          charger();
        });
        charger();
      } else {
        apercu.setAttribute('src', `/_blob/${brouillon.visuel}`);
      }
    }
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
    champ('Géotag (ville)', h('input', { type: 'text', name: 'geotag', maxlength: 200, value: brouillon.geotag, oninput: e => changer({ geotag: e.target.value }) })),
    h('button', { type: 'button', class: 'bouton-principal', onclick: copier }, 'Copier la caption et les hashtags'));

  const sectionScore = () => {
    const s = brouillon.score;
    const enfants = [
      h('h3', {}, s ? `Avis de ${nomAssistant(s.examen)} : ${s.total}/100` : 'Avis de Claude'),
      h('p', { class: 'aide' }, 'Avis d’expert, pas une prédiction de performance.'),
    ];
    if (!s) enfants.push(h('p', { class: 'aide' }, 'Pas encore évaluée.'));
    if (s) {
      if (aReevaluer(brouillon)) enfants.push(h('p', { class: 'aide' }, 'La fiche a changé depuis son évaluation : réévalue-la.'));
      const etat = s.conformite?.etat;
      const causes = s.conformite?.causes ?? [];
      enfants.push(h('p', { class: `conformite conformite-${etat}` },
        `Conformité : ${LIBELLES_CONFORMITE[etat] ?? 'non évaluée'}.`, causes.length ? ` ${causes.join(' ; ')}` : ''));
      enfants.push(h('ul', { class: 'criteres' }, (s.criteres ?? []).map(c => h('li', {}, `${c.nom} : ${c.points}/${c.max}. ${c.phrase ?? ''}`))));
      if (s.alertes?.length) enfants.push(h('h4', {}, 'Alertes'), h('ul', { class: 'alertes' }, s.alertes.map(a => h('li', {}, a))));
      enfants.push(h('details', { class: 'examen' }, h('summary', {}, s.examen?.source === 'dossier' ? 'Ce que l’assistant a examiné' : 'Ce que Claude a examiné'),
        h('ul', {}, lignesExamen(s.examen).map(l => h('li', {}, l)))));
    }
    if (brouillon.recommandations?.length) {
      enfants.push(h('h4', {}, 'Recommandations'), h('ol', { class: 'recommandations' }, brouillon.recommandations.map(r => (typeof r === 'string'
        ? h('li', {}, r)
        : h('li', {}, r.texte, r.pourquoi ? h('span', { class: 'pourquoi' }, ` Pourquoi : ${r.pourquoi}`) : null)))));
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

  const sectionStats = () => {
    if (brouillon.statut !== 'publie' || typeof actions.lireRelevesFiche !== 'function') return null;
    const zone = h('section', { class: 'stats-fiche' }, h('h3', {}, 'Statistiques'), h('p', { class: 'aide' }, 'Chargement des relevés…'));
    const dateLocale = iso => new Date(iso).toLocaleString('fr-FR', { timeZone: fz, dateStyle: 'medium', timeStyle: 'short' });
    const champsVisibles = CHAMPS_CONTENU.filter(c => c.cle !== 'clics_porte' || brouillon.format === 'story');

    function formulaire(r, existant, e, releves) {
      const entrees = champsVisibles.map(c => h('input', {
        type: 'number', min: '0', step: '1', inputmode: 'numeric', name: `${r}-${c.cle}`, value: existant?.[c.cle] ?? '',
      }));
      const retour = h('p', { class: 'aide', role: 'status' });
      const taux = tauxAbonnesParVue(existant);
      const etatTexte = e.etat === 'saisi'
        ? `Saisi${taux != null ? ` : ${formaterValeur('taux_abonnes_par_vue', taux)} d’abonnés par vue` : ''}.`
        : e.etat === 'a_saisir' ? 'À saisir.' : `À saisir à partir du ${dateLocale(e.du_le)}.`;
      return h('form', {
        class: 'releve',
        onsubmit: async ev => {
          ev.preventDefault();
          const saisie = Object.fromEntries(champsVisibles.map((c, i) => [c.cle, entrees[i].value]));
          retour.textContent = 'Enregistrement…';
          const res = await actions.enregistrerReleveContenu(id, r, saisie);
          if (!res.ok) { retour.textContent = res.erreurs.join(' '); return; }
          dessiner([...releves.filter(s => s.releve !== r), res.releve]);
        },
      },
      h('h4', {}, LIBELLES_RELEVE[r]),
      h('p', { class: `aide releve-${e.etat}` }, etatTexte),
      h('div', { class: 'grille-champs' }, champsVisibles.map((c, i) => champ(c.libelle, entrees[i]))),
      h('button', { type: 'submit', class: 'bouton-secondaire' }, existant ? 'Mettre à jour' : 'Enregistrer'),
      retour);
    }

    function dessiner(releves) {
      relevesConnus = releves;
      majAction();
      const etats = etatReleves(brouillon, releves, actions.maintenant());
      zone.replaceChildren(...[
        h('h3', {}, 'Statistiques'),
        etats.enRetard ? h('span', { class: 'etiquette etiquette-retard' }, 'Stats à saisir') : null,
        ...RELEVES.map(r => formulaire(r, releves.find(s => s.releve === r), etats[r], releves)),
      ].filter(Boolean));
    }

    actions.lireRelevesFiche(id).then(res => {
      if (!res.ok) { zone.replaceChildren(h('h3', {}, 'Statistiques'), h('p', { class: 'aide' }, res.raison)); return; }
      dessiner(res.releves);
    });
    return zone;
  };

  function construire() {
    elementAction = sectionAction();
    elementStatut = sectionStatut();
    elementScore = sectionScore();
    racine.replaceChildren(
      h('header', { class: 'panneau-tete' },
        h('h2', {}, LIBELLES_FORMAT[brouillon.format]),
        h('button', { type: 'button', class: 'fermer', 'aria-label': 'Fermer la fiche', onclick: () => actions.fermerPanneau() }, '×')),
      ...[elementAction, elementStatut, zoneConfirmation, sectionType(), sectionDate(), sectionVisuel(), sectionTexte(), elementScore, sectionStats(), message, sectionSuppression()].filter(Boolean));
  }

  construire();
  return racine;
}
