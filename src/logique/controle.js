import { ajouterJours, cleJour } from './dates.js';

const FEED = new Set(['reel', 'carrousel', 'post']);
const TOLERANCE = 1e-9;

export function fichesDeLaSemaine(fiches, debutIso, fuseau) {
  const fin = ajouterJours(debutIso, 7, fuseau);
  return fiches.filter(f => f.date_heure >= debutIso && f.date_heure < fin);
}

const selonCible = (n, cible) => (n >= cible ? 'vert' : n === cible - 1 ? 'orange' : 'rouge');

export function controlerSemaine(fiches, regles, debutIso) {
  const fz = regles.fuseau;
  const semaine = fichesDeLaSemaine(fiches, debutIso, fz);
  const feed = semaine.filter(f => FEED.has(f.format));
  const stories = semaine.filter(f => f.format === 'story');
  const pastilles = [];

  const nReel = semaine.filter(f => f.format === 'reel').length;
  const nCarrousel = semaine.filter(f => f.format === 'carrousel').length;
  pastilles.push({ cle: 'reels', libelle: 'Reels', valeur: `${nReel}/${regles.cadence.reel}`, etat: selonCible(nReel, regles.cadence.reel) });
  pastilles.push({ cle: 'carrousels', libelle: 'Carrousels', valeur: `${nCarrousel}/${regles.cadence.carrousel}`, etat: selonCible(nCarrousel, regles.cadence.carrousel) });

  const parJour = new Map();
  for (const f of stories) {
    const k = cleJour(f.date_heure, fz);
    parJour.set(k, (parJour.get(k) ?? 0) + 1);
  }
  const joursCouverts = regles.cadence.story_par_jour === 0
    ? 7
    : [...parJour.values()].filter(k => k >= regles.cadence.story_par_jour).length;
  pastilles.push({ cle: 'stories', libelle: 'Jours avec stories', valeur: `${joursCouverts}/7`, etat: joursCouverts === 7 ? 'vert' : joursCouverts >= 5 ? 'orange' : 'rouge' });

  const nCta = feed.filter(f => f.cta).length;
  const part = feed.length ? nCta / feed.length : 0;
  let etatCta = part <= regles.cta_ratio_max + TOLERANCE ? 'vert' : part <= regles.cta_ratio_max + 0.15 + TOLERANCE ? 'orange' : 'rouge';
  if (etatCta === 'vert' && feed.length >= 4 && nCta === 0) etatCta = 'orange';
  pastilles.push({ cle: 'cta', libelle: "Appels à l'action", valeur: `${nCta}/${feed.length}`, etat: etatCta });

  const roles = { engagement: 0, cta: 0, deadpan: 0 };
  for (const f of feed) if (f.role_caption in roles) roles[f.role_caption]++;
  const manques = Object.keys(roles).reduce((t, k) => t + Math.max(0, regles.roles_caption[k] - roles[k]), 0);
  pastilles.push({ cle: 'roles', libelle: 'Rôles des captions', valeur: `${roles.engagement}/${roles.cta}/${roles.deadpan}`, etat: manques === 0 ? 'vert' : manques === 1 ? 'orange' : 'rouge' });

  const nRage = semaine.filter(f => f.ragebait).length;
  pastilles.push({ cle: 'ragebait', libelle: 'Ragebait', valeur: `${nRage}/${regles.ragebait_max}`, etat: nRage <= regles.ragebait_max ? 'vert' : 'rouge' });

  const nPorte = stories.filter(f => f.porte).length;
  const { min, max } = regles.stories_porte;
  const etatPorte = nPorte >= min && nPorte <= max ? 'vert' : nPorte === min - 1 || nPorte === max + 1 ? 'orange' : 'rouge';
  pastilles.push({ cle: 'porte', libelle: 'Stories vers la porte', valeur: String(nPorte), etat: etatPorte });

  const parPilier = new Map(regles.piliers.map(p => [p.cle, 0]));
  for (const f of feed) if (parPilier.has(f.pilier)) parPilier.set(f.pilier, parPilier.get(f.pilier) + 1);
  const absents = [...parPilier.values()].filter(k => k === 0).length;
  const dominant = feed.length >= 4 && [...parPilier.values()].some(k => k / feed.length > 0.5);
  pastilles.push({
    cle: 'piliers', libelle: 'Piliers', valeur: `${regles.piliers.length - absents}/${regles.piliers.length}`,
    etat: !absents && !dominant ? 'vert' : absents && dominant ? 'rouge' : 'orange',
  });

  return pastilles;
}
