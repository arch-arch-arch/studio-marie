import { h } from './h.js';
import {
  FORMATS, LIBELLES_FORMAT, STATUTS, LIBELLES_STATUT, analyserHashtags, formaterHashtags, texteAPublier, aReevaluer,
} from '../logique/fiche.js';
import { cleJour, heureLocale, depuisSaisieLocale } from '../logique/dates.js';

const ROLES = [['', '—'], ['engagement', 'Engagement'], ['cta', "Appel à l'action"], ['deadpan', 'Deadpan']];

export function panneauFiche(fiche, profil, actions, capacites) {
  const r = profil.regles_studio;
  const fz = r.fuseau;
  const id = fiche.id;
  let brouillon = { ...fiche };
  const racine = h('aside', { class: 'panneau', 'aria-label': 'Fiche contenu' });
  const message = h('p', { class: 'panneau-message', role: 'status' });
  const afficher = texte => { message.replaceChildren(texte ?? ''); };
  let elementStatut = null;
  const changer = changements => {
    brouillon = { ...brouillon, ...changements };
    const resultat = actions.modifierFiche(id, changements);
    if (resultat != null && resultat.statut !== brouillon.statut) {
      brouillon = { ...brouillon, statut: resultat.statut };
      const nouvelElement = sectionStatut();
      elementStatut.replaceWith(nouvelElement);
      elementStatut = nouvelElement;
      afficher('La fiche est repassée en Brouillon : réévalue-la.');
    }
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
    if (!s) return h('section', { class: 'score' }, h('h3', {}, 'Score'), h('p', { class: 'aide' }, 'Pas encore évaluée.'));
    return h('section', { class: 'score' },
      h('h3', {}, `Score : ${s.total}/100`),
      aReevaluer(brouillon) ? h('p', { class: 'aide' }, 'La fiche a changé depuis son évaluation.') : null,
      h('ul', {}, (s.criteres ?? []).map(c => h('li', {}, `${c.nom} : ${c.points}/${c.max}. ${c.phrase ?? ''}`))));
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
    racine.replaceChildren(
      h('header', { class: 'panneau-tete' },
        h('h2', {}, LIBELLES_FORMAT[brouillon.format]),
        h('button', { type: 'button', class: 'fermer', 'aria-label': 'Fermer la fiche', onclick: () => actions.fermerPanneau() }, '×')),
      elementStatut, sectionType(), sectionDate(), sectionVisuel(), sectionTexte(), sectionScore(), message, sectionSuppression());
  }

  construire();
  return racine;
}
