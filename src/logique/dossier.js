import { debutSemaine, ajouterJours, debutMois, ajouterMois, cleSemaineIso, heureLocale, partiesLocales } from './dates.js';
import { empreinte, LIBELLES_FORMAT } from './fiche.js';
import { verifierRegles } from './regles-score.js';
import { controlerSemaine, fichesDeLaSemaine } from './controle.js';
import { CATEGORIES, categorieAffichee, categoriesDuProfil, nomCategorie } from './categories.js';
import { extraireProfilDetaille } from '../claude/evaluation.js';

export const FICHES_MAX = 30;
export const MESSAGE_A_COLLER = 'Voici le dossier d’analyse de mes contenus. Lis-le en entier, regarde chaque visuel, puis réponds en suivant exactement la consigne qui se trouve à la fin du dossier.';
const ROLES = ['engagement', 'cta', 'deadpan'];
const LEGENDE_REGLES = 'Pour chaque semaine, l’état (vert, orange ou rouge) dit si la cadence prévue est tenue. Ces états ne concernent pas la conformité d’un contenu.';
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
// Coupe à n unités UTF-16 sans laisser la moitié haute d'une paire de substitution.
export const couper = (texte, n) => {
  const t = String(texte ?? '').slice(0, n);
  const dernier = t.charCodeAt(t.length - 1);
  return dernier >= 0xD800 && dernier <= 0xDBFF ? t.slice(0, -1) : t;
};
const enRetrait = texte => texte.replace(/\r\n?|\n/g, '\n  ');
const deux = n => String(n).padStart(2, '0');
const date = (iso, fz, options) => new Intl.DateTimeFormat('fr-FR', { timeZone: fz, ...options }).format(new Date(iso));

export function periodeAffichee(vue, ancre, fuseau) {
  if (vue === 'mois') {
    const debut = debutMois(ancre, fuseau);
    const p = partiesLocales(debut, fuseau);
    return { type: 'mois', cle: `${p.annee}-${deux(p.mois)}`, debut, fin: ajouterMois(debut, 1, fuseau), libelle: date(debut, fuseau, { month: 'long', year: 'numeric' }) };
  }
  const debut = debutSemaine(ancre, fuseau);
  const dernier = ajouterJours(debut, 6, fuseau);
  const a = partiesLocales(debut, fuseau);
  const b = partiesLocales(dernier, fuseau);
  const options = a.annee !== b.annee ? { day: 'numeric', month: 'long', year: 'numeric' }
    : a.mois !== b.mois ? { day: 'numeric', month: 'long' } : { day: 'numeric' };
  return {
    type: 'semaine', cle: cleSemaineIso(debut, fuseau), debut, fin: ajouterJours(debut, 7, fuseau),
    libelle: `semaine du ${date(debut, fuseau, options)} au ${date(dernier, fuseau, { day: 'numeric', month: 'long', year: 'numeric' })}`,
  };
}

export function choisirFiches(fiches, periode) {
  const retenues = fiches
    .filter(f => f.date_heure >= periode.debut && f.date_heure < periode.fin && f.statut !== 'publie')
    .sort((a, b) => a.date_heure.localeCompare(b.date_heure) || a.id.localeCompare(b.id));
  if (!retenues.length) return { ok: false, raison: 'Aucune fiche à analyser sur cette période.' };
  if (retenues.length > FICHES_MAX) return { ok: false, raison: 'Trop de fiches pour un seul dossier : analyse semaine par semaine.' };
  return { ok: true, fiches: retenues };
}

export function codeDossier(aleatoire = Math.random) {
  let code = 'D-';
  for (let i = 0; i < 6; i += 1) code += ALPHABET[Math.floor(aleatoire() * ALPHABET.length) % ALPHABET.length];
  return code;
}

export const attribuerReferences = fiches => fiches.map((f, i) => ({ ref: `F${deux(i + 1)}`, id: f.id, empreinte: empreinte(f) }));

export function etatVisuel(fiche, carte) {
  if (!fiche.visuel) return { visuel: 'aucun', raison_visuel: null, mention: 'aucun' };
  const video = fiche.visuel_type === 'video';
  if (carte?.ok) {
    const mention = video ? 'vidéo (couverture et images extraites, de gauche à droite)'
      : fiche.format === 'carrousel' ? 'image (une seule image du carrousel est fournie)' : 'image';
    return { visuel: 'joint', raison_visuel: null, mention };
  }
  return video
    ? { visuel: 'non_joint', raison_visuel: 'video', mention: 'vidéo, non jointe' }
    : { visuel: 'non_joint', raison_visuel: 'indisponible', mention: 'présent mais non joint' };
}

const TYPO = { '’': "'", '‘': "'", '“': '"', '”': '"', '…': '...', '–': '-', '—': '-', 'œ': 'oe', 'Œ': 'OE', '€': 'EUR', ' ': ' ', ' ': ' ', ' ': ' ', '•': '-' };

Object.assign(TYPO, {
  '‑': '-', '−': '-', '​': '', '„': '"', '‹': '<', '›': '>', '™': '(TM)', 'ﬁ': 'fi', 'ﬂ': 'fl',
});

export function versLatin1(texte) {
  let sortie = '';
  for (const c of String(texte ?? '').normalize('NFC').replace(/\r\n?/g, '\n')) {
    const code = c.codePointAt(0);
    if (TYPO[c] !== undefined) sortie += TYPO[c];
    else if (code === 0xFE0F || code === 0x200D) continue;
    else if (code === 0x0A || code === 0x09) sortie += c;
    else if (code < 0x20 || (code >= 0x7F && code <= 0x9F)) sortie += ' ';
    else if (code <= 0xFF) sortie += c;
    else sortie += `[U+${code.toString(16).toUpperCase()}]`;
  }
  return sortie;
}

const titreSection = cle => cle.replace(/_/g, ' ');

const estObjet = x => x !== null && typeof x === 'object';

function scalaire(x) {
  if (x === null || x === undefined) return 'non renseigné';
  if (x === true) return 'oui';
  if (x === false) return 'non';
  return String(x);
}

const estVide = x => (Array.isArray(x) ? x.length === 0 : Object.keys(x).length === 0);

// Un texte (éventuellement sur plusieurs lignes) après un préfixe ; les lignes suivantes sont en retrait.
function ligneTexte(prefixe, etiquetteCle, x) {
  const texte = typeof x === 'string' ? (x.trim() === '' ? 'non renseigné' : x) : scalaire(x);
  const [premiere, ...suite] = texte.split(/\r?\n/);
  return [`${prefixe}${etiquetteCle}${premiere}`, ...suite.map(l => `${' '.repeat(prefixe.length + 2)}${l}`)];
}

function entree(cle, x, prefixe, niveauEnfant) {
  const nom = titreSection(cle);
  if (!estObjet(x)) return ligneTexte(prefixe, `${nom} : `, x);
  if (estVide(x)) return [`${prefixe}${nom} : aucun`];
  return [`${prefixe}${nom} :`, ...enListes(x, niveauEnfant)];
}

export function enListes(valeur, niveau = 0) {
  const retrait = '  '.repeat(niveau);
  if (Array.isArray(valeur)) {
    return valeur.flatMap(x => {
      if (!estObjet(x)) return ligneTexte(`${retrait}- `, '', x);
      if (estVide(x)) return [`${retrait}- aucun`];
      if (Array.isArray(x)) return [`${retrait}- liste :`, ...enListes(x, niveau + 1)];
      return Object.entries(x).flatMap(([k, v], i) => entree(k, v, i === 0 ? `${retrait}- ` : `${retrait}  `, niveau + 2));
    });
  }
  if (estObjet(valeur)) {
    return Object.entries(valeur).flatMap(([k, x]) => entree(k, x, `${retrait}- `, niveau + 1));
  }
  return ligneTexte(retrait, '', valeur);
}

// Une ligne exacte par pastille de controlerSemaine : ce que chacune compte, et par rapport à quoi.
export function ligneRegle(p, regles, fichesSemaine = []) {
  const feed = fichesSemaine.filter(f => ['reel', 'carrousel', 'post'].includes(f.format));
  const [n, total] = String(p.valeur).split('/');
  const fin = `(${p.etat})`;
  switch (p.cle) {
    case 'reels': case 'carrousels': return `${p.libelle} : ${n} sur ${total} attendus ${fin}`;
    case 'stories': return `${p.libelle} : ${n} sur 7 ${fin}`;
    case 'cta': {
      // Orange sans dépassement : aucun appel sur au moins 4 contenus du fil (voir controlerSemaine).
      const cause = p.etat === 'orange' && n === '0' && Number(total) >= 4 ? ' : aucun appel vers l\'offre cette semaine' : '';
      return `Appels vers l'offre : ${n} sur ${total} contenus du fil, maximum ${Math.round(regles.cta_ratio_max * 100)} % (${p.etat}${cause})`;
    }
    case 'roles': {
      const [e, c, d] = String(p.valeur).split('/');
      const o = regles.roles_caption;
      return `Rôles des captions : engagement ${e}, cta ${c}, deadpan ${d} ; objectifs ${o.engagement}, ${o.cta}, ${o.deadpan} ${fin}`;
    }
    case 'ragebait': return `${p.libelle} : ${n}, maximum ${total} ${fin}`;
    case 'porte': return `${p.libelle} : ${p.valeur}, objectif ${regles.stories_porte.min} à ${regles.stories_porte.max} ${fin}`;
    case 'piliers': {
      const parPilier = new Map();
      for (const f of feed) parPilier.set(f.pilier, (parPilier.get(f.pilier) ?? 0) + 1);
      const domine = feed.length >= 4 && [...parPilier.values()].some(k => k / feed.length > 0.5);
      return `Piliers présents : ${n} sur ${total} (${p.etat}${domine ? ' : un pilier domine plus de la moitié du fil' : ''})`;
    }
    default: return `${p.libelle} : ${p.valeur} ${fin}`;
  }
}

function semainesDeLaPeriode(periode, fuseau) {
  const debuts = [];
  for (let d = debutSemaine(periode.debut, fuseau); d < periode.fin; d = ajouterJours(d, 7, fuseau)) debuts.push(d);
  return debuts;
}

// Catégorie choisie, proposée (par l'analyse ou par une règle), ou non rangée.
function ligneCategorie(fiche) {
  const { cle, etat, source } = categorieAffichee(fiche);
  if (cle === null) return 'catégorie : non rangée';
  const mention = etat === 'choisie' ? 'choisie' : source === 'analyse' ? 'proposée par l’analyse' : 'proposée par règle';
  return `catégorie : ${nomCategorie(cle)} (${mention})`;
}

function blocFiche({ ref, fiche, etat }, profil) {
  const regles = profil.regles_studio;
  const fz = regles.fuseau;
  const pilier = regles.piliers.find(p => p.cle === fiche.pilier)?.nom ?? fiche.pilier ?? '';
  const v = verifierRegles(fiche, regles);
  const liste = (xs, vide) => (xs.length ? xs.join(' ; ') : vide);
  return [
    `<fiche id="${ref}">`,
    `date : ${date(fiche.date_heure, fz, { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}, ${heureLocale(fiche.date_heure, fz)}`,
    `format : ${LIBELLES_FORMAT[fiche.format] ?? fiche.format}`,
    `pilier : ${pilier}`,
    ligneCategorie(fiche),
    `rôle de caption : ${fiche.role_caption ?? 'non choisi'}`,
    `appel vers l'offre : ${fiche.cta ? 'oui' : 'non'}`,
    `mène à la porte : ${fiche.porte ? 'oui' : 'non'}`,
    `accroche : ${enRetrait(couper(fiche.accroche, 300))}`,
    `caption : ${enRetrait(couper(fiche.caption, 2200))}`,
    `hashtags : ${liste((fiche.hashtags ?? []).slice(0, 30), 'aucun').replace(/ ; /g, ', ')}`,
    `géotag : ${couper(fiche.geotag, 200) || 'aucun'}`,
    `visuel : ${etat.mention}`,
    `alertes calculées : ${liste(v.alertes.map(a => a.texte), 'aucune')}`,
    `blocages calculés : ${liste(v.conformite.causes, 'aucun')}`,
    '</fiche>',
  ].flatMap(l => versLatin1(l).split('\n'));
}

function etiquette(ref, fiche, fz) {
  const p = partiesLocales(fiche.date_heure, fz);
  return versLatin1(`${ref} · ${JOURS_COURTS[p.jourSemaine - 1]} ${deux(p.jour)}/${deux(p.mois)} · ${LIBELLES_FORMAT[fiche.format] ?? fiche.format}`);
}

const FORMATS_GRILLE = ['reel', 'carrousel', 'story', 'post'];
const lignesDe = xs => (Array.isArray(xs) ? xs.filter(x => typeof x === 'string' && x.trim() !== '') : []);

// Grilles du profil, format par format puis catégorie par catégorie ; null si le profil n'en a aucune.
function grillesDuProfil(profil) {
  const grilles = profil.categories_de_contenu?.grilles;
  if (!grilles || typeof grilles !== 'object') return null;
  const parFormat = FORMATS_GRILLE.map(k => ({ nom: LIBELLES_FORMAT[k], lignes: lignesDe(grilles.par_format?.[k]) })).filter(g => g.lignes.length);
  const parCategorie = CATEGORIES.map(c => ({ nom: c.nom, lignes: lignesDe(grilles.par_categorie?.[c.cle]) })).filter(g => g.lignes.length);
  return parFormat.length || parCategorie.length ? { parFormat, parCategorie } : null;
}

function lignesGrilles({ parFormat, parCategorie }) {
  const bloc = (titre, groupes) => (groupes.length
    ? [titre, ...groupes.flatMap(g => [`${g.nom} :`, ...g.lignes.map(l => `- ${l.replace(/\s*\r?\n\s*/g, ' ')}`)])]
    : []);
  return [...bloc('Grilles par format :', parFormat), ...bloc('Grilles par catégorie :', parCategorie)];
}

// Cible de la semaine d'une catégorie, en texte : « 3 contenus du fil », « 3 à 5 stories ».
function cibleCategorie(c) {
  const morceaux = [];
  if (c.cible_fil !== null) morceaux.push(`${c.cible_fil} ${c.cible_fil <= 1 ? 'contenu du fil' : 'contenus du fil'}`);
  if (c.cible_stories !== null) {
    const { min, max } = c.cible_stories;
    morceaux.push(`${min === max ? min : `${min} à ${max}`} ${min === max && min === 1 ? 'story' : 'stories'}`);
  }
  return morceaux;
}

// Rangement actuel : une ligne par catégorie si le profil a sa section (références, cible par semaine si elle en donne une), sinon seulement les catégories non vides ; puis les non rangées.
// Une référence dont la catégorie n'est que proposée porte « (proposée) ».
function rangement(entrees, profil) {
  const sectionPresente = profil.categories_de_contenu != null;
  const categories = categoriesDuProfil(profil);
  const parCle = new Map(categories.map(c => [c.cle, []]));
  const nonRangees = [];
  for (const e of entrees) {
    const { cle, etat } = categorieAffichee(e.fiche);
    if (cle === null) nonRangees.push(e.ref);
    else parCle.get(cle).push(etat === 'proposee' ? `${e.ref} (proposée)` : e.ref);
  }
  return [
    'Rangement actuel, à vérifier. Ces lignes ne sont pas des états de cadence.',
    ...categories.filter(c => sectionPresente || parCle.get(c.cle).length).map(c => {
      const refs = parCle.get(c.cle);
      const cibles = cibleCategorie(c);
      return `${c.nom} : ${refs.length ? refs.join(', ') : 'aucune'}${cibles.length ? ` · cible par semaine : ${cibles.join(' ; ')}` : ''}`;
    }),
    `Non rangées : ${nonRangees.length ? nonRangees.join(', ') : 'aucune'}`,
  ].map(versLatin1);
}

function consigne(entrees, code, profil) {
  const refs = entrees.map(e => e.ref);
  const courte = entrees.length > 10 ? ' Dans cette partie, au plus trois lignes par fiche.' : '';
  // La demande de rangement vient avec la section de catégories ; les grilles s'y ajoutent seulement si le profil en a.
  const demandeRangement = profil.categories_de_contenu != null;
  // Sans test de rangement utilisable, la demande s'appuie sur les définitions des catégories ; sans cible, la fin ne parle pas de cibles.
  const testRangement = lignesDe(profil.categories_de_contenu?.test_de_rangement).length > 0;
  const avecCibles = categoriesDuProfil(profil).some(c => c.cible_fil != null || c.cible_stories != null);
  const grilles = grillesDuProfil(profil);
  const exemple = {
    dossier: code,
    fiches: [{
      id: refs[0],
      categorie: demandeRangement ? 'connexion' : null,
      notes: { accroche: 7, voix: 8, mecanique: 6 },
      phrases: { accroche: '…', voix: '…', mecanique: '…' },
      conformite: { etat: 'vert', causes: [] },
      captions: [{ role: 'engagement', texte: '…' }, { role: 'deadpan', texte: '…' }],
      accroches: ['…', '…'],
      hashtags: ['mot'],
      recommandations: [{ texte: '…', pourquoi: '…' }, { texte: '…', pourquoi: '…' }, { texte: '…', pourquoi: '…' }],
    }],
    periode: { avis: '…', points_forts: ['…'], risques: ['…'], ordre_conseille: refs.slice(0, 2) },
  };
  return [
    'Tu es une éditrice exigeante. Analyse ces contenus Instagram au regard de la stratégie donnée plus haut.',
    'Chaque fiche a une référence, indiquée dans son bloc, et écrite en gros sur le bandeau noir de son visuel quand un visuel est joint. Regarde le visuel et le texte ensemble.',
    'Tu notes chaque contenu sans le modifier ; tes captions et tes accroches sont des variantes à part, dans la voix du profil. N’invente aucune donnée.',
    '',
    'Ce que tu notes, de 0 à 10, pour chaque fiche :',
    '- accroche : force de l’accroche (lisible en moins d’une seconde, paradoxe ou question), potentiel d’envoi et de sauvegarde, visage face caméra si le visuel est joint ;',
    '- voix : test de voix et vocabulaire du profil, esthétique si le visuel est joint, cohérence avec le pilier ;',
    '- mecanique : première ligne qui provoque avant « …plus », une seule micro-action, structure attendue pour ce format.',
    "Quand le visuel n'est pas joint, juge le texte seul et dis-le dans la phrase du critère.",
    'Conformité : "rouge" si la surface n’est pas SFW, si un groupe ou une identité est visé, si l’âge adulte est ambigu ou si un boost payant est suggéré ; "orange" si un risque mérite attention ; sinon "vert". Causes courtes et précises.',
    'Les alertes et blocages calculés par le studio font autorité : tu ne peux pas lever un blocage.',
    "Le champ « appel vers l'offre » ne concerne que le renvoi vers l'offre : une simple question au public n'est pas un appel vers l'offre.",
    'Les caractères que ce document ne sait pas écrire (émojis) sont notés par leur code entre crochets, par exemple [U+1F525].',
    'Dans tes captions et tes accroches, écris de vrais émojis si tu en utilises, jamais leur code entre crochets.',
    '',
    ...(demandeRangement ? [
      `Avant de noter, range chaque fiche ${testRangement ? 'avec le test de rangement de la stratégie' : 'selon les définitions des catégories de la stratégie'}. Si la fiche a déjà une catégorie, vérifie-la et dis en une phrase pourquoi tu la changes ; si rien ne permet de trancher, écris « non déterminable » dans ton analyse et mets "categorie": null dans le bloc.`,
      ...(grilles ? ['Juge chaque note avec la grille du format de la fiche et celle de sa catégorie, lues ci-dessous.', ...lignesGrilles(grilles)] : []),
      '',
    ] : []),
    'Ta réponse a deux parties.',
    `1. D’abord ton analyse en français courant, fiche par fiche, puis sur l’ensemble de la période.${courte}`,
    ...(demandeRangement ? [`   Commence chaque fiche par « Catégorie : … · Format : … », et finis l’analyse de la période par ${avecCibles ? 'le rangement comparé aux cibles' : 'le rangement de la période'}.`] : []),
    '2. Ensuite, la phrase « Bloc à coller dans le studio : » suivie d’UN SEUL bloc de code JSON, de cette forme exacte :',
    '',
    JSON.stringify(exemple, null, 2),
    '',
    `Contraintes du bloc : une entrée par fiche, dans l’ordre, avec les références recopiées telles quelles (${refs.length > 1 ? `${refs[0]} à ${refs.at(-1)}` : refs[0]}) ; une phrase par critère ; exactement 2 captions de rôles différents parmi ${ROLES.join(', ')} ; 2 ou 3 accroches ; hashtags sans # ; "categorie" parmi attraction, autorite, connexion, desir, preuve, conversion, ou null ; exactement 3 recommandations concrètes, chacune avec un pourquoi court qui cite ce que tu as observé ; "ordre_conseille" ne contient que des références du dossier ; tout en français ; aucun texte après le bloc.`,
  ].flatMap(l => l.split('\n')).map(versLatin1);
}

export function contenuDossier({ profil, entrees, periode, code, toutesLesFiches }) {
  const fz = profil.regles_studio.fuseau;
  const detail = extraireProfilDetaille(profil);
  const extrait = JSON.parse(detail.texte);
  // La section de catégories figure dans le dossier seulement : le profil envoyé à l'évaluation ne la reprend pas.
  const avecCategories = profil.categories_de_contenu != null;
  const sections = avecCategories ? [...detail.sections, 'categories_de_contenu'] : detail.sections;
  const valeurs = { ...extrait, categories_de_contenu: profil.categories_de_contenu };
  const strategie = sections.map(cle => ({ titre: versLatin1(titreSection(cle)), lignes: enListes(valeurs[cle]).map(versLatin1) }));
  const regles = [LEGENDE_REGLES, ...semainesDeLaPeriode(periode, fz).flatMap(debut => [
    `Semaine ${cleSemaineIso(debut, fz)} :`,
    ...controlerSemaine(toutesLesFiches, profil.regles_studio, debut).map(p => `- ${ligneRegle(p, profil.regles_studio, fichesDeLaSemaine(toutesLesFiches, debut, fz))}`),
  ])].map(versLatin1);
  return {
    titre: versLatin1(`Dossier d'analyse : ${periode.libelle}`),
    intro: versLatin1(`Dossier ${code}. Ce document contient la stratégie du compte, les règles de la période, puis une page par contenu avec son visuel. Chaque contenu a une référence (F01, F02…) écrite dans son bloc, et en gros sur le bandeau noir de son visuel quand un visuel est joint. La consigne et la forme de la réponse sont à la fin.`),
    strategie,
    sectionsProfil: detail.sections,
    regles,
    rangement: rangement(entrees, profil),
    fiches: entrees.map(e => ({ ref: e.ref, etiquette: etiquette(e.ref, e.fiche, fz), lignes: blocFiche(e, profil) })),
    consigne: consigne(entrees, code, profil),
  };
}