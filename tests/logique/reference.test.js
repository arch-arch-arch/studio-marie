import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import jeu from '../../exemples/reference-fictive.json';
import { validerReference, ficheDeReference, verifierClassement, SEUIL_CLASSEMENT } from '../../src/logique/reference.js';

describe('validerReference', () => {
  it('accepte le jeu fictif et numérote les contenus', () => {
    const r = validerReference(jeu);
    expect(r.ok).toBe(true);
    expect(r.items).toHaveLength(6);
    expect(r.items[0]).toMatchObject({ id: 'r1', format: 'reel', resultat: 'gagnant', pilier: 'nuit' });
  });
  it('refuse ce qui n’est pas une liste', () => {
    expect(validerReference({})).toEqual({ ok: false, erreurs: ['Le jeu de référence doit être une liste JSON.'] });
  });
  it('explique chaque élément invalide', () => {
    expect(validerReference([{ format: 'tiktok', resultat: 'moyen', accroche: '' }]).erreurs).toEqual([
      'Élément 1 : format inconnu.', 'Élément 1 : resultat doit valoir gagnant ou perdant.', 'Élément 1 : accroche manquante.',
    ]);
  });
  it('exige au moins un gagnant et un perdant, et 20 contenus au plus', () => {
    expect(validerReference([jeu[0]]).erreurs).toEqual(['Il faut au moins un contenu gagnant et un contenu perdant.']);
    expect(validerReference(Array.from({ length: 21 }, (_, i) => jeu[i % 6])).erreurs)
      .toContain('20 contenus au maximum (chaque vérification lance une évaluation par contenu).');
  });
});

describe('ficheDeReference', () => {
  it('place le contenu dans le premier créneau du profil', () => {
    const f = ficheDeReference(validerReference(jeu).items[0], fictif.regles_studio);
    expect(f).toMatchObject({ id: 'ref-r1', format: 'reel', date_heure: '2026-01-05T11:00:00.000Z', accroche: jeu[0].accroche, hashtags: jeu[0].hashtags });
  });
});

describe('verifierClassement', () => {
  it('compte les paires bien classées et liste les inversions', () => {
    const r = verifierClassement([
      { id: 'g1', resultat: 'gagnant', total: 80 }, { id: 'g2', resultat: 'gagnant', total: 50 },
      { id: 'p1', resultat: 'perdant', total: 40 }, { id: 'p2', resultat: 'perdant', total: 60 },
    ]);
    expect(r).toEqual({ taux: 0.75, paires: 4, ok: false, inversions: [{ gagnant: 'g2', perdant: 'p2' }] });
    expect(SEUIL_CLASSEMENT).toBe(0.8);
  });
  it('une égalité compte comme une inversion ; sans paire, rien n’est validé', () => {
    expect(verifierClassement([{ id: 'g', resultat: 'gagnant', total: 50 }, { id: 'p', resultat: 'perdant', total: 50 }]).ok).toBe(false);
    expect(verifierClassement([{ id: 'g', resultat: 'gagnant', total: 50 }])).toEqual({ taux: 0, paires: 0, ok: false, inversions: [] });
  });
});
