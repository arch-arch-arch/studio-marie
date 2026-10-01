import { describe, it, expect, vi } from 'vitest';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { creerBaseSupabase } from '../../src/socle/base-supabase.js';
import { creerDepot } from '../../src/donnees/depot.js';

const attendre = (ms = 80) => new Promise(r => setTimeout(r, ms));

describe('creerBaseSupabase', () => {
  it('écrit, lit et supprime un document', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    await db.doc('fiches/a').set({ accroche: 'x' });
    expect(client._lignes.get('fiches/a')).toMatchObject({ collection: 'fiches', id: 'a', data: { accroche: 'x' } });
    const s = await db.doc('fiches/a').get();
    expect([s.id, s.exists, s.data()]).toEqual(['a', true, { accroche: 'x' }]);
    await db.doc('fiches/a').delete();
    const apres = await db.doc('fiches/a').get();
    expect([apres.exists, apres.data()]).toEqual([false, undefined]);
  });

  it('filtre une collection avec where', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    await db.doc('fiches/a').set({ date_heure: '2026-09-28T10:00:00.000Z' });
    await db.doc('fiches/b').set({ date_heure: '2026-10-06T10:00:00.000Z' });
    await db.doc('bulletins/x').set({ date_heure: '2026-09-29T10:00:00.000Z' });
    const snap = await db.collection('fiches').where('date_heure', '>=', '2026-09-27T22:00:00.000Z').where('date_heure', '<', '2026-10-04T22:00:00.000Z').get();
    expect(snap.docs.map(d => [d.id, d.data()])).toEqual([['a', { date_heure: '2026-09-28T10:00:00.000Z' }]]);
    expect([snap.size, snap.empty]).toEqual([1, false]);
    const egal = await db.collection('fiches').where('date_heure', '==', '2026-10-06T10:00:00.000Z').get();
    expect(egal.docs.map(d => d.id)).toEqual(['b']);
  });

  it('pagine au-delà de 1000 documents', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    for (let i = 0; i < 1205; i += 1) client._lignes.set(`fiches/f${String(i).padStart(4, '0')}`, { collection: 'fiches', id: `f${String(i).padStart(4, '0')}`, data: {} });
    expect((await db.collection('fiches').get()).size).toBe(1205);
  });

  it('onSnapshot livre l’état initial puis les changements de sa collection', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    const recus = [];
    const stop = db.collection('fiches').onSnapshot(s => recus.push(s.docs.map(d => d.id)), () => {});
    await attendre();
    expect(recus).toEqual([[]]);
    await db.doc('fiches/a').set({ x: 1 });
    await db.doc('bulletins/b').set({ x: 1 });
    await attendre();
    expect(recus.at(-1)).toEqual(['a']);
    expect(recus).toHaveLength(2);
    stop();
    await db.doc('fiches/c').set({ x: 1 });
    await attendre();
    expect(recus).toHaveLength(2);
  });

  it('onSnapshot d’un document suit ses écritures et sa suppression', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    const recus = [];
    db.doc('profil/courant').onSnapshot(s => recus.push(s.exists ? s.data() : null), () => {});
    await attendre();
    await db.doc('profil/courant').set({ version: 1 });
    await attendre();
    await db.doc('profil/courant').delete();
    await attendre();
    expect(recus).toEqual([null, { version: 1 }, null]);
  });

  it('regroupe une rafale d’écritures en une seule relecture', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    const recus = [];
    db.collection('fiches').onSnapshot(s => recus.push(s.size), () => {});
    await attendre();
    const avant = client._lectures;
    for (let i = 0; i < 50; i += 1) await db.doc(`fiches/f${i}`).set({ i });
    await attendre(150);
    expect(recus.at(-1)).toBe(50);
    expect(client._lectures - avant).toBeLessThanOrEqual(3);
  });

  it('signale une session expirée avec le code revoked', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    client._panne({ message: 'JWT expired', code: 'PGRST301', status: 401 });
    await expect(db.doc('fiches/a').set({})).rejects.toMatchObject({ code: 'revoked' });
    const erreurs = [];
    db.collection('fiches').onSnapshot(() => {}, e => erreurs.push(e.code));
    await attendre();
    expect(erreurs).toEqual(['revoked']);
    client._panne({ message: 'boom', code: 'XX000', status: 500 });
    await expect(db.doc('fiches/a').get()).rejects.toMatchObject({ code: 'XX000' });
  });

  it('traite PGRST303 avec le statut 401 comme une session révoquée', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    client._panne({ message: 'JWT issued at future', code: 'PGRST303', status: 401 });
    await expect(db.doc('fiches/a').get()).rejects.toMatchObject({ code: 'revoked' });
    client._panne({ message: 'JWT invalide', code: 'PGRST303' });
    await expect(db.doc('fiches/a').get()).rejects.toMatchObject({ code: 'revoked' });
  });

  it('donne le code unavailable quand le code d’erreur est vide ou absent', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    client._panne({ message: 'hors ligne', code: '', status: 503 });
    await expect(db.doc('fiches/a').get()).rejects.toMatchObject({ code: 'unavailable' });
    client._panne({ message: 'hors ligne', status: 503 });
    await expect(db.doc('fiches/a').set({})).rejects.toMatchObject({ code: 'unavailable' });
  });

  it('relit tous les abonnés quand le canal (re)devient SUBSCRIBED', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    const recus = [];
    db.collection('fiches').onSnapshot(s => recus.push(s.docs.map(d => d.id)), () => {});
    await attendre();
    expect(recus).toEqual([[]]);
    client._lignes.set('fiches/z', { collection: 'fiches', id: 'z', data: {} });
    client._canal('SUBSCRIBED');
    await attendre();
    expect(recus.at(-1)).toEqual(['z']);
  });

  it('signale une erreur de canal à chaque abonné', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    const erreurs = [];
    db.collection('fiches').onSnapshot(() => {}, e => erreurs.push(['c', e.code]));
    db.doc('profil/courant').onSnapshot(() => {}, e => erreurs.push(['d', e.code]));
    await attendre();
    client._canal('CHANNEL_ERROR');
    client._canal('TIMED_OUT');
    expect(erreurs).toEqual([['c', 'unavailable'], ['d', 'unavailable'], ['c', 'unavailable'], ['d', 'unavailable']]);
  });

  it('ne laisse pas une lecture lente écraser un état plus récent', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    const recus = [];
    db.collection('fiches').onSnapshot(s => recus.push(s.docs.map(d => d.id)), () => {});
    await attendre();
    client._delaiLecture(120);
    await db.doc('fiches/a').set({});
    await attendre(70); // la lecture lente (état : a) est en vol
    client._delaiLecture(0);
    await db.doc('fiches/b').set({});
    await attendre(400);
    expect(recus.at(-1)).toEqual(['a', 'b']);
  });

  it('limite les relectures pendant une longue rafale espacée', async () => {
    const client = creerFauxSupabase();
    const db = creerBaseSupabase(client);
    const recus = [];
    db.collection('fiches').onSnapshot(s => recus.push(s.size), () => {});
    await attendre();
    client._delaiLecture(20);
    const avant = client._lectures;
    for (let i = 0; i < 30; i += 1) {
      await db.doc(`fiches/f${i}`).set({ i });
      await attendre(10);
    }
    await attendre(300);
    expect(recus.at(-1)).toBe(30);
    expect(client._lectures - avant).toBeLessThanOrEqual(12);
  });

  it('fait fonctionner le dépôt existant', async () => {
    const client = creerFauxSupabase();
    const depot = creerDepot(creerBaseSupabase(client));
    await depot.enregistrerFiche({ id: 'a', date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' });
    expect(await depot.lireFiche('a')).toEqual({ id: 'a', date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' });
    expect(await depot.lireCollection('fiches')).toEqual([{ id: 'a', data: { date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' } }]);
    const recues = vi.fn();
    depot.ecouterFiches('2026-09-27T22:00:00.000Z', '2026-10-04T22:00:00.000Z', recues, () => {});
    await attendre();
    expect(recues.mock.calls.at(-1)[0]).toEqual([{ id: 'a', date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' }]);
  });
});
