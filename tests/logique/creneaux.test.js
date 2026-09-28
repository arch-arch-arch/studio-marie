import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { depuisSaisieLocale } from '../../src/logique/dates.js';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { creneauxLibres } from '../../src/logique/creneaux.js';

const R = fictif.regles_studio;
const LUNDI = '2026-09-27T22:00:00.000Z';
let n = 0;
const fiche = (format, jour, heure) => nouvelleFiche({ id: `c${n++}`, format, date_heure: depuisSaisieLocale(jour, heure, R.fuseau), maintenant: LUNDI });

describe('creneauxLibres', () => {
  it('propose lundi, mardi et jeudi à midi sur une semaine vide', () => {
    expect(creneauxLibres([], R, LUNDI)).toEqual([
      { date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' },
      { date_heure: '2026-09-29T10:00:00.000Z', format: 'reel' },
      { date_heure: '2026-10-01T10:00:00.000Z', format: 'reel' },
    ]);
  });
  it('considère un créneau occupé par un contenu dans la plage', () => {
    const r = creneauxLibres([fiche('reel', '2026-09-29', '13:00')], R, LUNDI);
    expect(r.map(c => c.date_heure)).toEqual(['2026-09-28T10:00:00.000Z', '2026-10-01T10:00:00.000Z']);
  });
  it('ne compte pas un contenu hors de la plage horaire', () => {
    const r = creneauxLibres([fiche('reel', '2026-09-29', '16:00')], R, LUNDI);
    expect(r).toHaveLength(3);
  });
  it('ne compte pas les stories comme occupant un créneau', () => {
    expect(creneauxLibres([fiche('story', '2026-09-28', '12:30')], R, LUNDI)).toHaveLength(3);
  });
  it('ne propose rien quand la cadence est atteinte', () => {
    const pleins = [
      fiche('reel', '2026-09-30', '18:00'), fiche('reel', '2026-10-02', '18:00'),
      fiche('reel', '2026-10-03', '18:00'), fiche('reel', '2026-10-04', '18:00'),
      fiche('carrousel', '2026-10-02', '09:00'), fiche('carrousel', '2026-10-03', '09:00'),
    ];
    expect(creneauxLibres(pleins, R, LUNDI)).toEqual([]);
  });
  it('propose un carrousel une fois les Reels atteints', () => {
    const reels = ['2026-09-30', '2026-10-02', '2026-10-03', '2026-10-04'].map(j => fiche('reel', j, '18:00'));
    expect(creneauxLibres(reels, R, LUNDI).map(c => c.format)).toEqual(['carrousel', 'carrousel']);
  });
  it('écarte les créneaux déjà passés quand on donne l’heure actuelle', () => {
    expect(creneauxLibres([], R, LUNDI, '2026-10-01T14:00:00.000Z')).toEqual([]);
    expect(creneauxLibres([], R, LUNDI, '2026-09-29T09:59:00.000Z').map(c => c.date_heure)).toEqual(['2026-09-29T10:00:00.000Z', '2026-10-01T10:00:00.000Z']);
  });
});
