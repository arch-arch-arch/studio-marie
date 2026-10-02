import { debutSemaine, ajouterJours, debutMois, ajouterMois, cleSemaineIso, heureLocale, partiesLocales } from './dates.js';
import { empreinte, LIBELLES_FORMAT } from './fiche.js';
import { verifierRegles } from './regles-score.js';
import { controlerSemaine } from './controle.js';
import { extraireProfilDetaille } from '../claude/evaluation.js';

export const FICHES_MAX = 30;
export const MESSAGE_A_COLLER = 'Voici le dossier d’analyse de mes contenus. Lis-le en entier, regarde chaque visuel, puis réponds en suivant exactement la consigne qui se trouve à la fin du dossier.';
const ROLES = ['engagement', 'cta', 'deadpan'];
const ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const JOURS_COURTS = ['lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.', 'dim.'];
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
  return {
    type: 'semaine', cle: cleSemaineIso(debut, fuseau), debut, fin: ajouterJours(debut, 7, fuseau),
    libelle: `semaine du ${date(debut, fuseau, { day: 'numeric' })} au ${date(dernier, fuseau, { day: 'numeric', month: 'long', year: 'numeric' })}`,
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

export function versLatin1(texte) {
  let sortie = '';
  for (const c of String(texte ?? '')) {
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

export function enListes(valeur, niveau = 0) {
  const retrait = '  '.repeat(niveau);
  if (Array.isArray(valeur)) {
    return valeur.flatMap(x => (estObjet(x)
      ? enListes(x, niveau + 1).map((l, i) => (i === 0 ? `${retrait}- ${l.trimStart().replace(/^- /, '')}` : l))
      : [`${retrait}- ${scalaire(x)}`]));
  }
  if (estObjet(valeur)) {
    return Object.entries(valeur).flatMap(([k, x]) => (estObjet(x)
      ? [`${retrait}- ${titreSection(k)} :`, ...enListes(x, niveau + 1)]
      : [`${retrait}- ${titreSection(k)} : ${scalaire(x)}`]));
  }
  return [`${retrait}${scalaire(valeur)}`];
}

function semainesDeLaPeriode(periode, fuseau) {
  const debuts = [];
  for (let d = debutSemaine(periode.debut, fuseau); d < periode.fin; d = ajouterJours(d, 7, fuseau)) debuts.push(d);
  return debuts;
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
    `rôle de caption : ${fiche.role_caption ?? 'non choisi'}`,
    `appel vers l'offre : ${fiche.cta ? 'oui' : 'non'}`,
    `mène à la porte : ${fiche.porte ? 'oui' : 'non'}`,
    `accroche : ${fiche.accroche ?? ''}`,
    `caption : ${fiche.caption ?? ''}`,
    `hashtags : ${liste(fiche.hashtags ?? [], 'aucun').replace(/ ; /g, ', ')}`,
    `géotag : ${fiche.geotag || 'aucun'}`,
    `visuel : ${etat.mention}`,
    `alertes calculées : ${liste(v.alertes.map(a => a.texte), 'aucune')}`,
    `blocages calculés : ${liste(v.conformite.causes, 'aucun')}`,
    '</fiche>',
  ].map(versLatin1);
}

function etiquette(ref, fiche, fz) {
  const p = partiesLocales(fiche.date_heure, fz);
  return versLatin1(`${ref} · ${JOURS_COURTS[p.jourSemaine - 1]} ${deux(p.jour)}/${deux(p.mois)} · ${LIBELLES_FORMAT[fiche.format] ?? fiche.format}`);
}

function consigne(entrees, code) {
  const refs = entrees.map(e => e.ref);
  const courte = entrees.length > 10 ? ' Dans cette partie, au plus trois lignes par fiche.' : '';
  const exemple = {
    dossier: code,
    fiches: [{
      id: refs[0],
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
    'Chaque fiche a une référence, écrite en gros sur le bandeau noir de son visuel. Regarde le visuel et le texte ensemble.',
    'Tu notes chaque contenu sans le modifier ; tes captions et tes accroches sont des variantes à part, dans la voix du profil. N’invente aucune donnée.',
    '',
    'Ce que tu notes, de 0 à 10, pour chaque fiche :',
    '- accroche : force de l’accroche (lisible en moins d’une seconde, paradoxe ou question), potentiel d’envoi et de sauvegarde, visage face caméra si le visuel est joint ;',
    '- voix : test de voix et vocabulaire du profil, esthétique du visuel, cohérence avec le pilier ;',
    '- mecanique : première ligne qui provoque avant « …plus », une seule micro-action, structure attendue pour ce format.',
    'Conformité : "rouge" si la surface n’est pas SFW, si un groupe ou une identité est visé, si l’âge adulte est ambigu ou si un boost payant est suggéré ; "orange" si un risque mérite attention ; sinon "vert". Causes courtes et précises.',
    'Les alertes et blocages calculés par le studio font autorité : tu ne peux pas lever un blocage.',
    "Le champ « appel vers l'offre » ne concerne que le renvoi vers l'offre : une simple question au public n'est pas un appel vers l'offre.",
    'Les caractères que ce document ne sait pas écrire (émojis) sont notés par leur code entre crochets, par exemple [U+1F525].',
    '',
    'Ta réponse a deux parties.',
    `1. D’abord ton analyse en français courant, fiche par fiche, puis sur l’ensemble de la période.${courte}`,
    '2. Ensuite, la phrase « Bloc à coller dans le studio : » suivie d’UN SEUL bloc de code JSON, de cette forme exacte :',
    '',
    JSON.stringify(exemple, null, 2),
    '',
    `Contraintes du bloc : une entrée par fiche, dans l’ordre, avec les références recopiées telles quelles (${refs[0]} à ${refs.at(-1)}) ; une phrase par critère ; exactement 2 captions de rôles différents parmi engagement, cta, deadpan ; 2 ou 3 accroches ; hashtags sans # ; exactement 3 recommandations concrètes, chacune avec un pourquoi court qui cite ce que tu as observé ; "ordre_conseille" ne contient que des références du dossier ; tout en français ; aucun texte après le bloc.`,
  ].flatMap(l => l.split('\n')).map(versLatin1);
}

export function contenuDossier({ profil, entrees, periode, code, toutesLesFiches }) {
  const fz = profil.regles_studio.fuseau;
  const detail = extraireProfilDetaille(profil);
  const extrait = JSON.parse(detail.texte);
  const strategie = detail.sections.map(cle => ({ titre: versLatin1(titreSection(cle)), lignes: enListes(extrait[cle]).map(versLatin1) }));
  const regles = semainesDeLaPeriode(periode, fz).flatMap(debut => [
    `Semaine ${cleSemaineIso(debut, fz)} :`,
    ...controlerSemaine(toutesLesFiches, profil.regles_studio, debut).map(p => `- ${p.libelle} : ${p.valeur} (${p.etat})`),
  ]).map(versLatin1);
  return {
    titre: versLatin1(`Dossier d'analyse : ${periode.libelle}`),
    intro: versLatin1(`Dossier ${code}. Ce document contient la stratégie du compte, les règles de la période, puis une page par contenu avec son visuel. Chaque contenu a une référence (F01, F02…) écrite en gros sur le bandeau noir de son visuel. La consigne et la forme de la réponse sont à la fin.`),
    strategie,
    sectionsProfil: detail.sections,
    regles,
    fiches: entrees.map(e => ({ ref: e.ref, etiquette: etiquette(e.ref, e.fiche, fz), lignes: blocFiche(e, profil) })),
    consigne: consigne(entrees, code),
  };
}