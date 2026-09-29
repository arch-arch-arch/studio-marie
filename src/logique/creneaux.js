import { ajouterJours, cleJour, heureLocale, depuisSaisieLocale } from './dates.js';
import { fichesDeLaSemaine } from './controle.js';

const FEED = new Set(['reel', 'carrousel', 'post']);

export function creneauxDisponibles(fiches, regles, debutIso, maintenantIso = null) {
  const fz = regles.fuseau;
  const feed = fichesDeLaSemaine(fiches, debutIso, fz).filter(f => FEED.has(f.format));
  const libres = [];
  for (let i = 0; i < 7; i++) {
    const cle = cleJour(ajouterJours(debutIso, i, fz), fz);
    for (const cr of regles.creneaux) {
      if (!cr.jours.includes(i + 1)) continue;
      const occupe = feed.some(f => {
        if (cleJour(f.date_heure, fz) !== cle) return false;
        const h = heureLocale(f.date_heure, fz);
        return h >= cr.debut && h < cr.fin;
      });
      if (occupe) continue;
      const debutCreneau = depuisSaisieLocale(cle, cr.debut, fz);
      if (maintenantIso && debutCreneau < maintenantIso) continue;
      libres.push(debutCreneau);
    }
  }
  return libres.sort();
}

export function creneauxLibres(fiches, regles, debutIso, maintenantIso = null) {
  const feed = fichesDeLaSemaine(fiches, debutIso, regles.fuseau).filter(f => FEED.has(f.format));
  const manque = format => Math.max(0, regles.cadence[format] - feed.filter(f => f.format === format).length);
  const aPlacer = [...Array(manque('reel')).fill('reel'), ...Array(manque('carrousel')).fill('carrousel')];
  if (aPlacer.length === 0) return [];
  return creneauxDisponibles(fiches, regles, debutIso, maintenantIso)
    .slice(0, aPlacer.length)
    .map((date_heure, i) => ({ date_heure, format: aPlacer[i] }));
}
