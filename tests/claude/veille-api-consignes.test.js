import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { FORMATS } from '../../src/logique/fiche.js';
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
  it('complète les consignes : tendances insuffisantes, valeurs permises, contrôle de semaine, performance', () => {
    for (const attendu of [
      'Si tu as moins de 3 tendances exploitables, mets sources_indisponibles à true et garde celles que tu as',
      `format : ${FORMATS.join(', ')}`,
      'conformite.etat : vert, orange ou rouge',
      'notes : des entiers de 0 à 10',
      'role_caption : engagement, cta ou deadpan',
      'ragebait',
      'cta_ratio_max',
      'roles_caption',
      'stories_porte',
      'abonnés par vue',
      'partages et envois',
      'tendance vaut le titre exact d’une tendance retenue, ou null',
    ]) expect(c.systeme).toContain(attendu);
  });

  describe('priorité aux contenus proches de la semaine visée', () => {
    const fiche = (i, date_heure, accroche = `Fiche ${i}`) => ({ id: `f${i}`, format: 'reel', pilier: 'nuit', accroche, date_heure, statut: 'brouillon' });
    const jour = n => new Date(Date.UTC(2026, 8, 1) + n * 86400000).toISOString();
    const construire = (fiches, stats = []) => construireConsignesVeille({ profil: { ...fictif, version: 2 }, fiches, stats, relevesCompte: [], plage, maintenant: '2026-10-04T18:00:00.000Z' });
    const ligneSuivant = (message, titre) => { const lignes = message.split('\n'); return JSON.parse(lignes[lignes.indexOf(titre) + 1]); };
    it('garde d’abord les fiches de la semaine visée, puis les plus récentes', () => {
      const anciennes = Array.from({ length: 70 }, (_, i) => fiche(i, jour(i % 30), `Ancienne ${String(i).padStart(2, '0')}`));
      const visee = fiche(900, '2026-10-06T10:00:00.000Z', 'Dans la semaine visée');
      const apres = fiche(901, '2026-11-20T10:00:00.000Z', 'Très loin après');
      const json = ligneSuivant(construire([...anciennes, visee, apres]).message, '## Contenus déjà prévus ou récents (JSON)');
      expect(json).toHaveLength(60);
      expect(json[0].accroche).toBe('Dans la semaine visée');
      expect(json[1].accroche).toBe('Très loin après');
      const dates = json.slice(1).map(f => f.date_heure);
      expect([...dates].sort().reverse()).toEqual(dates);
    });
    it('garde les relevés dont la publication est la plus récente', () => {
      const stats = Array.from({ length: 45 }, (_, i) => ({ fiche: `s${i}`, releve: '7j', vues: 1, nouveaux_abonnes: 0, partages_envois: 0, accroche: `Relevé ${String(i).padStart(2, '0')}`, format: 'reel', date_publication: jour(i) }));
      const json = ligneSuivant(construire([], stats).message, '## Relevés de statistiques des deux dernières semaines (JSON)');
      expect(json).toHaveLength(40);
      expect(json[0].accroche).toBe('Relevé 44');
      expect(json.at(-1).accroche).toBe('Relevé 05');
    });
  });
});
