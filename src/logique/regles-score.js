import { heureLocale, partiesLocales } from './dates.js';

const FEED = new Set(['reel', 'carrousel', 'post']);
const MOTIF_LIEN = /(https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(com|fr|net|org|io|me|co|ly|link|page|bio)\b(\/\S*)?/i;
const MOTIF_ADRESSE = /\d|\b(rue|avenue|av\.|boulevard|bd|chemin|impasse|allée|place|chez|domicile|maison|appart(ement)?)\b/i;

const normaliser = texte => (texte ?? '').toLocaleLowerCase('fr-FR');

export const compterMots = texte => (texte ?? '').trim().split(/\s+/).filter(Boolean).length;

export function dansUnCreneau(iso, regles) {
  const { jourSemaine } = partiesLocales(iso, regles.fuseau);
  const heure = heureLocale(iso, regles.fuseau);
  return regles.creneaux.some(c => c.jours.includes(jourSemaine) && heure >= c.debut && heure < c.fin);
}

export function verifierRegles(fiche, regles) {
  const causes = [];
  const alertes = [];

  const textes = [fiche.accroche, fiche.caption, ...(fiche.hashtags ?? [])].map(normaliser).join('\n');
  for (const mot of regles.mots_a_eviter ?? []) {
    const cherche = normaliser(mot).trim();
    if (cherche && textes.includes(cherche)) causes.push(`mot à éviter « ${mot.trim()} »`);
  }

  const lienAutorise = fiche.format === 'story' && fiche.porte;
  if (!lienAutorise && MOTIF_LIEN.test(`${fiche.accroche ?? ''}\n${fiche.caption ?? ''}`)) {
    causes.push('lien dans le texte (seule une story qui mène à la porte peut porter un lien)');
  }

  if (fiche.geotag?.trim() && MOTIF_ADRESSE.test(fiche.geotag)) {
    causes.push(`géotag trop précis « ${fiche.geotag.trim()} » (reste au niveau de la ville)`);
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
