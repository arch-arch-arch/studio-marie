import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { construireExport, COLLECTIONS_EXPORT } from '../../src/logique/sauvegarde.js';
import { migrer, associerVisuels } from '../../scripts/migrer.mjs';

const vide = () => Object.fromEntries(COLLECTIONS_EXPORT.map(c => [c, []]));
const exportAvec = docs => construireExport({ ...vide(), ...docs }, '2026-10-01T08:00:00.000Z');
const visuel = id => ({ id, type: 'image/png', contenu: new Blob(['x'], { type: 'image/png' }) });

describe('migrer', () => {
  it('écrit les documents et les visuels sous leurs identifiants d’origine', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({
      exportJson: exportAvec({ profil: [{ id: 'courant', data: { ...fictif, version: 2 } }], fiches: [{ id: 'f1', data: { visuel: 'a1', accroche: 'x' } }, { id: 'f2', data: { visuel: null } }] }),
      visuels: [visuel('a1')], supabase, journal: () => {},
    });
    expect(r).toEqual({ ok: true, documents: 3, visuels: 1 });
    expect(supabase._lignes.get('fiches/f1').data).toEqual({ visuel: 'a1', accroche: 'x' });
    expect(supabase._lignes.get('profil/courant').data.version).toBe(2);
    expect(supabase._fichiers.has('visuels/a1')).toBe(true);
  });
  it('s’arrête avant d’écrire si l’export est invalide', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({ exportJson: exportAvec({ profil: [{ id: 'courant', data: {} }] }), visuels: [], supabase, journal: () => {} });
    expect(r.ok).toBe(false);
    expect(r.erreurs[0]).toMatch(/^profil\/courant : /);
    expect(supabase._lignes.size).toBe(0);
  });
  it('s’arrête avant d’écrire si un visuel référencé manque', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({ exportJson: exportAvec({ fiches: [{ id: 'f1', data: { visuel: 'a1' } }, { id: 'f2', data: { visuel: 'a2' } }] }), visuels: [visuel('a1')], supabase, journal: () => {} });
    expect(r).toEqual({ ok: false, erreurs: ['Visuel manquant : a2 (fiche f2).'] });
    expect(supabase._lignes.size).toBe(0);
    expect(supabase._fichiers.size).toBe(0);
  });
  it('signale une écriture en échec', async () => {
    const supabase = creerFauxSupabase();
    supabase._panne({ message: 'boom', status: 500 });
    const r = await migrer({ exportJson: exportAvec({ fiches: [{ id: 'f1', data: {} }] }), visuels: [], supabase, journal: () => {} });
    expect(r.ok).toBe(false);
    expect(r.erreurs[0]).toContain('boom');
  });
  it('refuse, avant toute écriture, un visuel référencé sans type image accepté', async () => {
    const exportJson = exportAvec({ fiches: [{ id: 'f1', data: { visuel: 'a1' } }, { id: 'f2', data: { visuel: 'a2' } }] });
    for (const [contenu, attendu] of [
      [new Blob(['x']), 'Visuel a2 : type non accepté ().'],
      [new Blob(['x'], { type: 'application/pdf' }), 'Visuel a2 : type non accepté (application/pdf).'],
      ['pas un blob', 'Visuel a2 : type non accepté ().'],
    ]) {
      const supabase = creerFauxSupabase();
      const r = await migrer({ exportJson, visuels: [visuel('a1'), { id: 'a2', type: 'image/png', contenu }], supabase, journal: () => {} });
      expect(r).toEqual({ ok: false, erreurs: [attendu] });
      expect(supabase._lignes.size).toBe(0);
      expect(supabase._fichiers.size).toBe(0);
    }
  });
  it('en simulation, valide et compte sans rien écrire', async () => {
    const supabase = creerFauxSupabase();
    const lignes = [];
    const r = await migrer({
      exportJson: exportAvec({ fiches: [{ id: 'f1', data: { visuel: 'a1' } }, { id: 'f2', data: {} }] }),
      visuels: [visuel('a1')], supabase, journal: m => lignes.push(m), simuler: true,
    });
    expect(r).toEqual({ ok: true, documents: 2, visuels: 1, simulation: true });
    expect(supabase._lignes.size).toBe(0);
    expect(supabase._fichiers.size).toBe(0);
    expect(lignes).toContain('fiches : 2');
  });
  it('la simulation signale aussi un export invalide', async () => {
    const r = await migrer({ exportJson: { format: 'autre' }, visuels: [], supabase: creerFauxSupabase(), journal: () => {}, simuler: true });
    expect(r.ok).toBe(false);
  });
  it('est réexécutable : deux migrations donnent le même état', async () => {
    const supabase = creerFauxSupabase();
    const exportJson = exportAvec({ fiches: [{ id: 'f1', data: { visuel: 'a1' } }, { id: 'f2', data: {} }] });
    const lancer = () => migrer({ exportJson, visuels: [visuel('a1')], supabase, journal: () => {}, maintenant: '2026-10-01T09:00:00.000Z' });
    const r1 = await lancer();
    const etat = JSON.stringify([...supabase._lignes]);
    const r2 = await lancer();
    expect(r1).toEqual({ ok: true, documents: 2, visuels: 1 });
    expect(r2).toEqual(r1);
    expect(JSON.stringify([...supabase._lignes])).toBe(etat);
    expect(supabase._lignes.size).toBe(2);
    expect(supabase._fichiers.size).toBe(1);
  });
  it('ne migre pas le marqueur de veille', async () => {
    const supabase = creerFauxSupabase();
    const lignes = [];
    const r = await migrer({
      exportJson: exportAvec({ config: [{ id: 'veille_en_cours', data: { debut: 'x' } }, { id: 'reglages', data: { a: 1 } }] }),
      visuels: [], supabase, journal: m => lignes.push(m),
    });
    expect(r).toEqual({ ok: true, documents: 1, visuels: 0 });
    expect(supabase._lignes.has('config/veille_en_cours')).toBe(false);
    expect(supabase._lignes.has('config/reglages')).toBe(true);
    expect(lignes).toContain('Marqueur de veille ignoré.');
  });
  it('utilise un seul horodatage maj_le pour toute la migration', async () => {
    const supabase = creerFauxSupabase();
    await migrer({ exportJson: exportAvec({ fiches: [{ id: 'f1', data: {} }], bulletins: [{ id: 'b1', data: {} }] }), visuels: [], supabase, journal: () => {}, maintenant: '2026-10-01T09:00:00.000Z' });
    expect([...supabase._lignes.values()].map(l => l.maj_le)).toEqual(['2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z']);
  });
});

describe('associerVisuels', () => {
  it('garde le nom complet s’il est référencé', () => {
    expect(associerVisuels(['a1.png'], new Set(['a1.png']))).toEqual({ associes: [{ id: 'a1.png', nom: 'a1.png', type: 'image/png' }], ignores: [] });
  });
  it('retire la dernière extension si seul le nom sans extension est référencé', () => {
    expect(associerVisuels(['a1.JPG', 'b.v2.webp'], new Set(['a1', 'b.v2']))).toEqual({
      associes: [{ id: 'a1', nom: 'a1.JPG', type: 'image/jpeg' }, { id: 'b.v2', nom: 'b.v2.webp', type: 'image/webp' }],
      ignores: [],
    });
  });
  it('ignore un fichier non référencé ou d’extension inconnue', () => {
    expect(associerVisuels(['z.png', 'a1.xyz', 'a1'], new Set(['a1']))).toEqual({ associes: [], ignores: ['z.png', 'a1.xyz', 'a1'] });
  });
  it('refuse deux fichiers qui donnent le même identifiant', () => {
    expect(() => associerVisuels(['a1.png', 'a1.jpg'], new Set(['a1']))).toThrow(/a1/);
  });
});
