import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { creerDepot } from '../../src/donnees/depot.js';

const T = '2026-09-27T20:00:00.000Z';

describe('fiches', () => {
  it('enregistre sans l’id et écoute une plage de dates', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    await depot.enregistrerFiche({ id: 'a', date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' });
    await depot.enregistrerFiche({ id: 'b', date_heure: '2026-10-06T10:00:00.000Z', format: 'reel' });
    expect(db._docs.get('fiches/a')).toEqual({ date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' });
    const recues = [];
    const stop = depot.ecouterFiches('2026-09-27T22:00:00.000Z', '2026-10-04T22:00:00.000Z', f => recues.push(f));
    expect(recues.at(-1)).toEqual([{ id: 'a', date_heure: '2026-09-28T10:00:00.000Z', format: 'reel' }]);
    stop();
  });
  it('supprime', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    await depot.enregistrerFiche({ id: 'a', date_heure: T });
    await depot.supprimerFiche('a');
    expect(db._docs.has('fiches/a')).toBe(false);
  });
});

describe('profil', () => {
  it('refuse un profil invalide sans rien écrire', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const r = await depot.importerProfil({ meta: {} }, T);
    expect(r.ok).toBe(false);
    expect(r.erreurs[0]).toContain('regles_studio');
    expect(db.ecritures).toEqual([]);
  });
  it('versionne et archive les imports successifs', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const vus = [];
    depot.ecouterProfil(p => vus.push(p));
    expect(vus[0]).toBeNull();
    expect(await depot.importerProfil(fictif, T)).toEqual({ ok: true, erreurs: [], version: 1 });
    expect(await depot.importerProfil(fictif, T)).toEqual({ ok: true, erreurs: [], version: 2 });
    expect(vus.at(-1)).toMatchObject({ version: 2, importe_le: T });
    expect(db._docs.get('profil_archives/v1')).toMatchObject({ version: 1 });
  });
  it('laisse le profil courant intact quand un nouvel import est refusé', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    await depot.importerProfil(fictif, T);
    await depot.importerProfil({ regles_studio: { fuseau: 'Mars/Olympus' } }, T);
    expect(db._docs.get('profil/courant')).toMatchObject({ version: 1 });
  });
});
