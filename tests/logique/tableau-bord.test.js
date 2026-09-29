import { describe, it, expect } from 'vitest';
import {
  RAPPEL_RETROSPECTIVE, relevesParFiche, croissancesNettes, classerContenus, ecartsCibles, seriesTableau, retrospective,
} from '../../src/logique/tableau-bord.js';

const FZ = 'Europe/Paris';
const stat = (fiche, releve, extra = {}) => ({
  id: `${fiche}_${releve}`, fiche, releve, vues: 1000, nouveaux_abonnes: 3, partages_envois: 10, sauvegardes: null, visites_profil: null, clics_porte: null,
  date_publication: '2026-09-15T10:00:00.000Z', format: 'reel', pilier: 'socio', accroche: `Accroche ${fiche}`, score_total: 70, ...extra,
});
const compte = (semaine, debut, abonnes, extra = {}) => ({ id: semaine, semaine, debut, abonnes, vues_moyennes_stories: null, clics_porte: null, ...extra });
// Lundis 00:00 à Paris (heure d'été) : W37 = 2026-09-06T22:00Z, W38 = 09-13, W39 = 09-20, W40 = 09-27
const W37 = '2026-09-06T22:00:00.000Z'; const W38 = '2026-09-13T22:00:00.000Z';
const W39 = '2026-09-20T22:00:00.000Z'; const W40 = '2026-09-27T22:00:00.000Z';

describe('relevesParFiche', () => {
  it('garde le relevé à 7 jours s’il existe, sinon celui à 48 h, et trie par date', () => {
    const r = relevesParFiche([
      stat('b', '48h', { date_publication: '2026-09-18T10:00:00.000Z' }),
      stat('a', '7j', { vues: 2000 }), stat('a', '48h', { vues: 500 }),
    ]);
    expect(r.map(s => s.id)).toEqual(['a_7j', 'b_48h']);
  });
});

describe('croissancesNettes', () => {
  it('compare avec la semaine précédente seulement', () => {
    const c = croissancesNettes([compte('2026-W40', W40, 1200), compte('2026-W37', W37, 1000), compte('2026-W38', W38, 1050)], FZ);
    expect(c.map(x => [x.semaine, x.croissance])).toEqual([['2026-W37', null], ['2026-W38', 50], ['2026-W40', null]]);
  });
});

describe('classerContenus', () => {
  it('classe par taux puis par partages, sans les vues à 0, sans doublon entre meilleurs et pires', () => {
    const stats = [
      stat('a', '7j', { nouveaux_abonnes: 9 }), stat('b', '7j', { nouveaux_abonnes: 3, partages_envois: 50 }),
      stat('c', '7j', { nouveaux_abonnes: 3, partages_envois: 5 }), stat('z', '7j', { vues: 0 }),
    ];
    const { meilleurs, pires } = classerContenus(stats, 2);
    expect(meilleurs.map(s => s.fiche)).toEqual(['a', 'b']);
    expect(pires.map(s => s.fiche)).toEqual(['c']);
    expect(meilleurs[0].taux).toBeCloseTo(0.009);
  });
});

describe('ecartsCibles', () => {
  it('mesure chaque cible disponible', () => {
    const e = ecartsCibles({
      stats: [stat('a', '7j', { nouveaux_abonnes: 4 }), stat('p', '7j', { format: 'carrousel', partages_envois: 30 }), stat('s', '7j', { format: 'story', partages_envois: 0 })],
      relevesCompte: [compte('2026-W38', W38, 1000), compte('2026-W39', W39, 1080, { clics_porte: 12 })],
      cibles: { taux_abonnes_par_vue: 0.003, partages_par_post: 25, croissance_nette_semaine: 100, clics_porte_semaine: 10 },
      fuseau: FZ,
    });
    expect(e.map(x => [x.indicateur, x.atteinte])).toEqual([
      ['taux_abonnes_par_vue', true], ['partages_par_post', false], ['croissance_nette_semaine', false], ['clics_porte_semaine', true],
    ]);
    expect(e.find(x => x.indicateur === 'partages_par_post').valeur).toBe(20);
  });
  it('sans cibles, aucun écart', () => {
    expect(ecartsCibles({ stats: [stat('a', '7j')], relevesCompte: [], cibles: undefined, fuseau: FZ })).toEqual([]);
  });
});

describe('seriesTableau', () => {
  it('prépare les six vues', () => {
    const s = seriesTableau({
      stats: [stat('a', '7j'), stat('p', '48h', { format: 'post', score_total: null }), stat('s', '7j', { format: 'story' })],
      relevesCompte: [compte('2026-W38', W38, 1000, { clics_porte: 4 }), compte('2026-W39', W39, 1100, { clics_porte: 9 })],
      fuseau: FZ,
    });
    expect(s.reels.map(p => p.fiche)).toEqual(['a']);
    expect(s.partages.map(p => p.fiche)).toEqual(['a', 'p']);
    expect(s.croissance).toEqual([{ semaine: '2026-W39', valeur: 100 }]);
    expect(s.porte).toEqual([{ semaine: '2026-W38', valeur: 4 }, { semaine: '2026-W39', valeur: 9 }]);
    expect(s.scoreReel.map(p => p.fiche)).toEqual(['a', 's']);
    expect(s.classement.meilleurs.length).toBeGreaterThan(0);
  });
});

describe('retrospective', () => {
  const fiche = (id, date_heure, statut = 'publie') => ({ id, statut, date_heure, accroche: `Accroche ${id}` });
  it('sans aucun relevé sur les 2 semaines : rappel, avec les relevés manquants', () => {
    const r = retrospective({
      stats: [], relevesCompte: [], fiches: [fiche('f1', '2026-09-22T10:00:00.000Z')], cibles: undefined,
      fuseau: FZ, debutSemaineVisee: W40, maintenant: '2026-09-27T18:00:00.000Z',
    });
    expect(r.type).toBe('rappel');
    expect(r.texte).toBe(RAPPEL_RETROSPECTIVE);
    expect(r.manquants).toEqual([{ fiche: 'f1', releve: '48h', accroche: 'Accroche f1' }]);
  });
  it('avec des relevés : meilleur, pire, écarts et manquants, sur les 2 semaines avant la semaine visée', () => {
    const r = retrospective({
      stats: [
        stat('a', '48h', { date_publication: '2026-09-15T10:00:00.000Z', nouveaux_abonnes: 5 }),
        stat('a', '7j', { date_publication: '2026-09-15T10:00:00.000Z', nouveaux_abonnes: 9 }),
        stat('b', '48h', { date_publication: '2026-09-22T10:00:00.000Z', nouveaux_abonnes: 1 }),
        stat('vieux', '7j', { date_publication: '2026-09-01T10:00:00.000Z', nouveaux_abonnes: 50 }),
      ],
      relevesCompte: [compte('2026-W38', W38, 1000), compte('2026-W39', W39, 1150)],
      fiches: [fiche('a', '2026-09-15T10:00:00.000Z'), fiche('b', '2026-09-22T10:00:00.000Z')],
      cibles: { croissance_nette_semaine: 100 }, fuseau: FZ, debutSemaineVisee: W40, maintenant: '2026-09-27T18:00:00.000Z',
    });
    expect(r.type).toBe('bilan');
    expect(r.meilleur.fiche).toBe('a');
    expect(r.pire.fiche).toBe('b');
    expect(r.ecarts).toEqual([{ indicateur: 'croissance_nette_semaine', libelle: 'Croissance nette de la semaine', valeur: 150, cible: 100, atteinte: true }]);
    expect(r.manquants).toEqual([]);
    expect(r.texte).toBe('2 contenus relevés sur les 2 dernières semaines.');
  });
  it('le texte signale les relevés manquants', () => {
    const r = retrospective({
      stats: [stat('a', '48h', { date_publication: '2026-09-15T10:00:00.000Z' })], relevesCompte: [],
      fiches: [fiche('a', '2026-09-15T10:00:00.000Z')], cibles: undefined, fuseau: FZ, debutSemaineVisee: W40, maintenant: '2026-09-27T18:00:00.000Z',
    });
    expect(r.texte).toBe('1 contenu relevé sur les 2 dernières semaines. 1 relevé manquant.');
  });
  it('ignore des relevés de compte trop anciens pour la croissance nette et les clics sur la porte', () => {
    const W30 = '2026-07-19T22:00:00.000Z'; const W31 = '2026-07-26T22:00:00.000Z';
    const r = retrospective({
      stats: [stat('a', '48h', { date_publication: '2026-09-15T10:00:00.000Z' })],
      relevesCompte: [compte('2026-W30', W30, 900), compte('2026-W31', W31, 950, { clics_porte: 8 })],
      fiches: [fiche('a', '2026-09-15T10:00:00.000Z')],
      cibles: { croissance_nette_semaine: 40, clics_porte_semaine: 5 }, fuseau: FZ, debutSemaineVisee: W40, maintenant: '2026-09-27T18:00:00.000Z',
    });
    expect(r.ecarts).toEqual([]);
  });
});
