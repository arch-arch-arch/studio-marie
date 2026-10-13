import { ajouterJours, cleJour } from './dates.js';

export function fichesDeLaSemaine(fiches, debutIso, fuseau) {
  const fin = ajouterJours(debutIso, 7, fuseau);
  return fiches.filter(f => f.date_heure >= debutIso && f.date_heure < fin);
}

const selonCible = (n, cible) => (n >= cible ? 'vert' : n === cible - 1 ? 'orange' : 'rouge');

export function controlerSemaine(fiches, regles, debutIso) {
  const fz = regles.fuseau;
  const semaine = fichesDeLaSemaine(fiches, debutIso, fz);
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

  return pastilles;
}
