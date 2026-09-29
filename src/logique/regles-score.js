import { heureLocale, partiesLocales } from './dates.js';

const FEED = new Set(['reel', 'carrousel', 'post']);

// --- Liens ---------------------------------------------------------------

const DOMAINES_BIO = ['linktr\\.ee', 'beacons\\.ai', 'lnk\\.bio', 'linkin\\.bio', 'allmylinks\\.com', 'bit\\.ly'];
const EXTENSIONS_SURES = 'com|net|org|io|ly|link|page|bio|ee|ai|xyz|app';

const DETECTEURS_LIEN = [
  { re: /https?:\/\/\S+/iu, groupe: 0 },
  { re: /www\.\S+/iu, groupe: 0 },
  { re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${DOMAINES_BIO.join('|')})(?![\\p{L}\\p{N}])(?:/\\S*)?`, 'iu'), groupe: 0 },
  { re: /[\p{L}\p{N}-]+\.[a-z]{2,}\/\S*/iu, groupe: 0 },
  { re: new RegExp(`(?:^|[\\s(«"'])([\\p{L}\\p{N}-]+\\.(?:${EXTENSIONS_SURES}))(?=$|[\\s.,;:!?)»"'])`, 'iu'), groupe: 1 },
];

function detecterLien(texte) {
  for (const { re, groupe } of DETECTEURS_LIEN) {
    const m = texte.match(re);
    if (m) return m[groupe];
  }
  return null;
}

// --- Géotag ----------------------------------------------------------------

const LONGUEUR_MAX_GEOTAG = 200;
// Écrits sans accent : le géotag analysé passe par normaliser() avant le test.
const TYPES_VOIE = ['rue', 'avenue', 'av\\.?', 'boulevard', 'bd', 'chemin', 'impasse', 'allee', 'place', 'quai', 'cours', 'square', 'passage', 'villa', 'cite', 'route', 'residence', 'faubourg'];
const MARQUEURS_DOMICILE = ['chez', 'domicile', 'maison', 'appart(?:ement)?'];
const RE_MARQUEUR_ADRESSE = new RegExp(`(?<![\\p{L}\\p{N}])(?:${[...TYPES_VOIE, ...MARQUEURS_DOMICILE].join('|')})(?![\\p{L}\\p{N}])`, 'iu');
const RE_CODE_POSTAL = /(?<!\d)\d{5}(?!\d)/;
const RE_NUMERO_VOIE = new RegExp(`(?<!\\d)\\d+(?:\\s*(?:bis|ter))?(?:\\s*,)?\\s*(?:${TYPES_VOIE.join('|')})(?![\\p{L}\\p{N}])`, 'iu');

function geotagTropPrecis(geotag) {
  const g = normaliser((geotag ?? '').slice(0, LONGUEUR_MAX_GEOTAG));
  return RE_MARQUEUR_ADRESSE.test(g) || RE_CODE_POSTAL.test(g) || RE_NUMERO_VOIE.test(g);
}

// --- Mots à éviter -----------------------------------------------------------

const echapperRegex = s => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function normaliser(texte) {
  return (texte ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}

export const compterMots = texte => (texte ?? '').trim().split(/\s+/).filter(Boolean).length;

export function dansUnCreneau(iso, regles) {
  const { jourSemaine } = partiesLocales(iso, regles.fuseau);
  const heure = heureLocale(iso, regles.fuseau);
  return regles.creneaux.some(c => c.jours.includes(jourSemaine) && heure >= c.debut && heure < c.fin);
}

export function verifierRegles(fiche, regles) {
  const causes = [];
  const alertes = [];

  const texteNormalise = normaliser(`${fiche.accroche ?? ''} ${fiche.caption ?? ''}`);
  const hashtagsNormalises = (fiche.hashtags ?? []).map(normaliser);
  for (const mot of regles.mots_a_eviter ?? []) {
    const cherche = normaliser(mot);
    if (!cherche) continue;
    const motSansEspaces = cherche.replace(/\s+/g, '');
    const re = new RegExp(`(?<![\\p{L}\\p{N}])${echapperRegex(cherche)}(?![\\p{L}\\p{N}])`, 'u');
    const dansLeTexte = re.test(texteNormalise);
    const dansLesHashtags = hashtagsNormalises.some(h => h === motSansEspaces || (motSansEspaces.length >= 6 && h.includes(motSansEspaces)));
    if (dansLeTexte || dansLesHashtags) causes.push(`mot à éviter « ${mot.trim()} »`);
  }

  const lienAutorise = fiche.format === 'story' && fiche.porte;
  const fragmentLien = detecterLien(`${fiche.accroche ?? ''}\n${fiche.caption ?? ''}`);
  if (!lienAutorise && fragmentLien) {
    causes.push(`lien « ${fragmentLien} » dans le texte (seule une story qui mène à la porte peut porter un lien)`);
  }

  if (fiche.geotag?.trim() && geotagTropPrecis(fiche.geotag)) {
    const g = fiche.geotag.trim();
    const affiche = g.length > 60 ? `${g.slice(0, 60)}…` : g;
    causes.push(`géotag trop précis « ${affiche} » (reste au niveau de la ville)`);
  }

  const motsAccroche = compterMots(fiche.accroche);
  if (motsAccroche === 0) alertes.push({ critere: 'accroche', texte: 'Pas d’accroche.' });
  else if (motsAccroche > regles.accroche_mots_max) {
    alertes.push({ critere: 'accroche', texte: `Accroche trop longue : ${motsAccroche} mots (${regles.accroche_mots_max} au maximum).` });
  }

  const nbHashtags = (fiche.hashtags ?? []).length;
  if (fiche.format !== 'story' && (nbHashtags < regles.hashtags.min || nbHashtags > regles.hashtags.max)) {
    alertes.push({ critere: 'mecanique', texte: `${nbHashtags} hashtag(s) : vise entre ${regles.hashtags.min} et ${regles.hashtags.max}.` });
  }

  if (FEED.has(fiche.format) && !dansUnCreneau(fiche.date_heure, regles)) {
    alertes.push({ critere: 'accroche', texte: 'Hors des créneaux recommandés du profil.' });
  }

  if (fiche.format === 'post') {
    alertes.push({ critere: null, texte: 'Photo seule : le profil recommande un carrousel.' });
  }

  return { conformite: { etat: causes.length ? 'rouge' : 'vert', causes }, alertes, mesures: { motsAccroche, nbHashtags } };
}
