import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { depuisSaisieLocale } from '../../src/logique/dates.js';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { controlerSemaine, fichesDeLaSemaine } from '../../src/logique/controle.js';

const R = fictif.regles_studio;
const FZ = R.fuseau;
const LUNDI = '2026-09-27T22:00:00.000Z';
let n = 0;
const fiche = (format, jour, extra = {}, heure = '12:00') => ({
  ...nouvelleFiche({ id: `t${n++}`, format, date_heure: depuisSaisieLocale(jour, heure, FZ), maintenant: LUNDI }),
  ...extra,
});
const JOURS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const etats = pastilles => Object.fromEntries(pastilles.map(p => [p.cle, p.etat]));
const valeurs = pastilles => Object.fromEntries(pastilles.map(p => [p.cle, p.valeur]));

function semaineIdeale() {
  return [
    fiche('reel', JOURS[0], { role_caption: 'engagement', pilier: 'socio' }),
    fiche('reel', JOURS[1], { role_caption: 'engagement', pilier: 'nuit' }),
    fiche('reel', JOURS[3], { role_caption: 'cta', cta: true, pilier: 'pont_offre' }),
    fiche('reel', JOURS[4], { role_caption: 'deadpan', pilier: 'humour_sec', ragebait: true }),
    fiche('carrousel', JOURS[2], { role_caption: 'engagement', pilier: 'socio' }),
    fiche('carrousel', JOURS[5], { role_caption: 'engagement', pilier: 'nuit' }),
    ...JOURS.map((j, i) => fiche('story', j, { porte: i < 2 }, '19:00')),
  ];
}

describe('controlerSemaine', () => {
  it('semaine vide', () => {
    const p = controlerSemaine([], R, LUNDI);
    expect(p.map(x => x.cle)).toEqual(['reels', 'carrousels', 'stories']);
    expect(etats(p)).toEqual({ reels: 'rouge', carrousels: 'rouge', stories: 'rouge' });
    expect(valeurs(p)).toMatchObject({ reels: '0/4', carrousels: '0/2', stories: '0/7' });
  });

  it('semaine idéale : tout au vert', () => {
    const p = controlerSemaine(semaineIdeale(), R, LUNDI);
    expect(Object.values(etats(p))).toEqual(Array(3).fill('vert'));
    expect(valeurs(p)).toMatchObject({ reels: '4/4', carrousels: '2/2', stories: '7/7' });
  });

  it('ignore les fiches hors de la semaine', () => {
    const p = controlerSemaine([...semaineIdeale(), fiche('reel', '2026-10-05')], R, LUNDI);
    expect(valeurs(p).reels).toBe('4/4');
  });

  it('juge les stories', () => {
    const cinqJours = JOURS.slice(0, 5).map(j => fiche('story', j));
    expect(etats(controlerSemaine(cinqJours, R, LUNDI)).stories).toBe('orange');
  });
});

describe('fichesDeLaSemaine', () => {
  it('garde une story du dimanche 23 h 30 dans la semaine du changement d’heure', () => {
    const debut = '2026-10-18T22:00:00.000Z';
    const dimanche = fiche('story', '2026-10-25', {}, '23:30');
    const lundiSuivant = fiche('story', '2026-10-26', {}, '00:10');
    expect(fichesDeLaSemaine([dimanche, lundiSuivant], debut, FZ).map(f => f.id)).toEqual([dimanche.id]);
  });
});

describe('pastilles de la fiche allégée', () => {
  it('ne garde que reels, carrousels et stories', () => {
    expect(controlerSemaine([], R, LUNDI).map(p => p.cle)).toEqual(['reels', 'carrousels', 'stories']);
  });
  it('semaine idéale : trois pastilles, toutes vertes', () => {
    const p = controlerSemaine(semaineIdeale(), R, LUNDI);
    expect(p.map(x => x.cle)).toEqual(['reels', 'carrousels', 'stories']);
    expect(etats(p)).toEqual({ reels: 'vert', carrousels: 'vert', stories: 'vert' });
  });
});
