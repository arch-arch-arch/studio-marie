import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { construireConsignesVeille } from '../../src/claude/veille-consignes.js';

describe('construireConsignesVeille', () => {
  const plage = { semaine: '2026-W41', debut: '2026-10-04T22:00:00.000Z', fin: '2026-10-11T22:00:00.000Z' };
  const c = construireConsignesVeille({
    profil: { ...fictif, version: 2 },
    fiches: [{ id: 'f1', format: 'reel', pilier: 'nuit', accroche: 'Déjà prévue', date_heure: '2026-10-06T10:00:00.000Z', statut: 'brouillon' }],
    stats: [{ fiche: 'a', releve: '7j', vues: 1000, nouveaux_abonnes: 4, partages_envois: 9, accroche: 'Ancien succès', format: 'reel' }],
    relevesCompte: [], plage, maintenant: '2026-10-04T18:00:00.000Z',
  });
  it('rappelle les règles et le format de sortie', () => {
    for (const attendu of ['Pas de scraping d’Instagram', 'sources_indisponibles', 'son_a_verifier', 'proposition_profil', '"jugement"', '"recommandations":[{"texte":"…","pourquoi":"…"}', '3 à 5', 'uniquement avec un objet JSON']) {
      expect(c.systeme).toContain(attendu);
    }
  });
  it('fournit le contexte du studio', () => {
    for (const attendu of ['2026-W41', 'Déjà prévue', 'Ancien succès', '"regles_studio"']) expect(c.message).toContain(attendu);
  });
});
