import { h } from './h.js';

export function vueProfil({ profil, reference = [], resultatReference = null, verificationReference = null }, actions, capacites = {}) {
  const erreurs = h('ul', { class: 'erreurs', 'aria-live': 'polite' });
  const zone = h('textarea', { id: 'profil-json', rows: 12, placeholder: 'Colle ici le JSON du profil de marque.' });
  const fichier = h('input', {
    type: 'file', accept: '.json,application/json',
    onchange: async e => { const f = e.target.files?.[0]; if (f) zone.value = await f.text(); },
  });
  const importer = async () => {
    erreurs.replaceChildren();
    const r = await actions.importerProfil(zone.value);
    if (!r.ok) erreurs.replaceChildren(...r.erreurs.map(m => h('li', {}, m)));
  };

  let ref = null;
  const enfants = [
    profil ? resume(profil) : h('p', { class: 'aide' }, 'Aucun profil pour l’instant. Importe le profil de marque pour commencer.'),
    h('section', { class: 'import' },
      h('h2', {}, profil ? 'Importer une nouvelle version' : 'Importer le profil'),
      h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Fichier JSON'), fichier),
      h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Ou colle le JSON'), zone),
      h('button', { type: 'button', class: 'bouton-principal', onclick: importer }, 'Importer cette version'),
      erreurs),
  ];
  if (profil) {
    ref = sectionReference({ reference, resultatReference, verificationReference }, actions, capacites, profil.regles_studio.fuseau);
    enfants.push(ref.element);
  }

  enfants.push(sectionSauvegarde(actions, capacites));

  const racine = h('div', { class: 'profil' }, ...enfants);
  racine.mettreAJour = e => ref?.mettreAJour(e);
  return racine;
}

function sectionReference(initial, actions, capacites, fuseau) {
  const zone = h('textarea', { id: 'reference-json', rows: 8, placeholder: 'Colle ici la liste JSON des contenus de référence (voir exemples/reference-fictive.json).' });
  const erreurs = h('ul', { class: 'erreurs', 'aria-live': 'polite' });
  const message = h('p', { class: 'aide', role: 'status' });
  const etatZone = h('div', { class: 'reference-etat' });
  const boutonImporter = h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => importer() }, 'Importer ce jeu');

  async function importer() {
    erreurs.replaceChildren();
    message.textContent = '';
    const r = await actions.importerReference(zone.value);
    if (!r.ok) {
      erreurs.replaceChildren(...r.erreurs.map(m => h('li', {}, m)));
      return;
    }
    message.textContent = `${r.nombre} contenus importés.`;
    if (r.erreurs.length) erreurs.replaceChildren(...r.erreurs.map(m => h('li', {}, m)));
  }

  function mettreAJour({ reference, resultatReference, verificationReference }) {
    const gagnants = reference.filter(i => i.resultat === 'gagnant').length;
    const perdants = reference.filter(i => i.resultat === 'perdant').length;
    let commande = null;
    if (capacites.sample && reference.length) {
      commande = verificationReference
        ? h('div', { class: 'evaluation-actions' },
          h('p', { class: 'aide' }, `Vérification en cours : ${verificationReference.fait}/${verificationReference.total}`),
          h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => actions.arreterReference() }, 'Arrêter'))
        : h('button', { type: 'button', class: 'bouton-principal', onclick: () => actions.verifierReference() },
          `Vérifier le classement (${reference.length} évaluations sur ton compte Claude)`);
    }
    etatZone.replaceChildren(
      h('p', { class: 'aide' }, `${reference.length} contenus (${gagnants} gagnants, ${perdants} perdants). Le score doit classer les gagnants au-dessus des perdants.`),
      resultatReference ? bilanReference(resultatReference, fuseau) : h('p', { class: 'aide' }, 'Pas encore vérifié.'),
      commande);
    boutonImporter.disabled = !!verificationReference;
  }

  mettreAJour(initial);

  const element = h('section', { class: 'reference' },
    h('h2', {}, 'Jeu de référence'),
    etatZone,
    h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Remplacer le jeu (JSON)'), zone),
    boutonImporter,
    erreurs, message);

  return { element, mettreAJour };
}

function bilanReference(b, fuseau) {
  const accroche = id => b.resultats?.find(r => r.id === id)?.accroche ?? id;
  const date = new Date(b.verifie_le).toLocaleString('fr-FR', { timeZone: fuseau });
  return h('div', { class: b.ok ? 'bilan bilan-ok' : 'bilan bilan-ko' },
    h('p', {}, `${Math.round(b.taux * 100)} % des paires bien classées (seuil 80 %) : ${b.ok ? 'calibration correcte' : 'à recalibrer'}. Vérifié le ${date}, profil version ${b.version_profil}.`),
    b.inversions?.length
      ? h('ul', {}, b.inversions.map(i => h('li', {}, `« ${accroche(i.gagnant)} » n’est pas au-dessus de « ${accroche(i.perdant)} »`)))
      : null);
}

function resume(profil) {
  const r = profil.regles_studio;
  const date = profil.importe_le ? new Date(profil.importe_le).toLocaleString('fr-FR', { timeZone: r.fuseau }) : '—';
  const jours = ['', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
  return h('section', { class: 'resume' },
    h('h2', {}, `Profil, version ${profil.version}`),
    h('p', { class: 'aide' }, `Importé le ${date}. Fuseau : ${r.fuseau}.`),
    h('dl', { class: 'regles' },
      h('dt', {}, 'Piliers'), h('dd', {}, r.piliers.map(p => h('span', { class: 'puce-pilier', style: { '--pilier': p.couleur } }, p.nom))),
      h('dt', {}, 'Cadence'), h('dd', {}, `${r.cadence.reel} Reels, ${r.cadence.carrousel} carrousels, ${r.cadence.story_par_jour} story par jour`),
      h('dt', {}, 'Créneaux'), h('dd', {}, r.creneaux.map(c => `${c.jours.map(j => jours[j]).join(' ')} ${c.debut}–${c.fin}`).join(' · ')),
      h('dt', {}, "Appels à l'action"), h('dd', {}, `au plus ${Math.round(r.cta_ratio_max * 100)} % du feed`),
      h('dt', {}, 'Stories vers la porte'), h('dd', {}, `${r.stories_porte.min} à ${r.stories_porte.max} par semaine`)));
}

function sectionSauvegarde(actions, capacites) {
  const message = h('p', { class: 'aide', role: 'status' });
  const erreurs = h('ul', { class: 'erreurs', 'aria-live': 'polite' });
  const apercu = h('div', { class: 'apercu-restauration' });
  const afficherErreurs = liste => erreurs.replaceChildren(...liste.map(m => h('li', {}, m)));

  async function exporter() {
    message.textContent = 'Préparation de l’export…';
    const r = await actions.exporterDonnees();
    message.textContent = r.ok ? r.message : r.raison;
  }

  async function restaurer(validation, sauvegarder) {
    apercu.replaceChildren();
    message.textContent = 'Restauration en cours…';
    const r = await actions.restaurerDonnees(validation, { sauvegarder });
    if (r.ok) { message.textContent = r.message; erreurs.replaceChildren(); return; }
    message.textContent = '';
    afficherErreurs(r.erreurs);
  }

  async function choisir(fichier) {
    if (!fichier) return;
    erreurs.replaceChildren();
    apercu.replaceChildren();
    message.textContent = '';
    const r = await actions.analyserRestauration(await fichier.text());
    if (!r.ok) { afficherErreurs(r.erreurs); return; }
    apercu.replaceChildren(
      h('p', {}, r.resume),
      h('div', { class: 'evaluation-actions' },
        capacites.downloads ? h('button', { type: 'button', class: 'bouton-principal', onclick: () => restaurer(r.validation, true) }, 'Sauvegarder l’état actuel puis restaurer') : null,
        h('button', { type: 'button', class: 'bouton-secondaire', onclick: () => restaurer(r.validation, false) }, 'Restaurer sans sauvegarde'),
        h('button', { type: 'button', class: 'bouton-lien', onclick: () => apercu.replaceChildren() }, 'Annuler')));
  }

  return h('section', { class: 'sauvegarde' },
    h('h2', {}, 'Sauvegarde'),
    h('p', { class: 'aide' }, 'L’export contient le profil, les fiches, les bulletins, les statistiques et le jeu de référence. Les visuels ne sont pas inclus : seuls leurs identifiants le sont.'),
    capacites.downloads
      ? h('button', { type: 'button', class: 'bouton-secondaire', onclick: exporter }, 'Exporter les données')
      : h('p', { class: 'aide' }, 'L’export n’est pas disponible dans cette vue.'),
    h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Restaurer depuis un export…'),
      h('input', { type: 'file', accept: '.json,application/json', onchange: e => choisir(e.target.files?.[0]) })),
    apercu, message, erreurs);
}
