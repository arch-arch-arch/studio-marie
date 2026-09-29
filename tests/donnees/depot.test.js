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
  it('lit une fiche par id, ou renvoie null si elle n’existe pas', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    await depot.enregistrerFiche({ id: 'a', date_heure: T, format: 'reel' });
    expect(await depot.lireFiche('a')).toEqual({ id: 'a', date_heure: T, format: 'reel' });
    expect(await depot.lireFiche('inconnue')).toBeNull();
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

describe('jeu de référence', () => {
  it('remplace le jeu en supprimant les contenus retirés, et garde le dernier bilan', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const vus = [];
    depot.ecouterReference(liste => vus.push(liste));
    await depot.remplacerReference([{ id: 'r1', accroche: 'a' }, { id: 'r2', accroche: 'b' }], []);
    await depot.remplacerReference([{ id: 'r1', accroche: 'c' }], vus.at(-1));
    expect(vus.at(-1)).toEqual([{ id: 'r1', accroche: 'c' }]);
    const bilans = [];
    depot.ecouterResultatReference(b => bilans.push(b));
    expect(bilans[0]).toBeNull();
    await depot.enregistrerResultatReference({ taux: 1, ok: true });
    expect(bilans.at(-1)).toEqual({ taux: 1, ok: true });
  });
  it('efface le bilan', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    await depot.enregistrerResultatReference({ taux: 1, ok: true });
    await depot.effacerResultatReference();
    expect(db._docs.has('reference_resultats/dernier')).toBe(false);
  });
});

describe('bulletin et configuration de la veille', () => {
  it('écoute un bulletin par semaine et la configuration', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const bulletins = [];
    depot.ecouterBulletin('2026-W41', b => bulletins.push(b));
    expect(bulletins[0]).toBeNull();
    await db.doc('bulletins/2026-W41').set({ semaine: '2026-W41', statut: 'complet' });
    expect(bulletins.at(-1)).toEqual({ semaine: '2026-W41', statut: 'complet' });
    const configs = [];
    depot.ecouterConfigVeille(c => configs.push(c));
    expect(configs[0]).toBeNull();
    await db.doc('config/veille').set({ url_routine: 'https://exemple.test/routine' });
    expect(configs.at(-1)).toEqual({ url_routine: 'https://exemple.test/routine' });
  });
});

describe('relevés', () => {
  it('écrit, relit et remplace un relevé de contenu sans doublon', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    await depot.enregistrerReleveContenu({ id: 'f1_48h', fiche: 'f1', releve: '48h', vues: 10, date_publication: '2026-09-20T10:00:00.000Z' });
    await depot.enregistrerReleveContenu({ id: 'f1_48h', fiche: 'f1', releve: '48h', vues: 12, date_publication: '2026-09-20T10:00:00.000Z' });
    const lus = await depot.lireRelevesFiche('f1');
    expect(lus).toEqual([{ id: 'f1_48h', fiche: 'f1', releve: '48h', vues: 12, date_publication: '2026-09-20T10:00:00.000Z' }]);
    expect(await depot.lireRelevesFiche('autre')).toEqual([]);
  });

  it('écoute les relevés publiés depuis une date', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const recus = [];
    depot.ecouterStats('2026-09-01T00:00:00.000Z', l => recus.push(l.map(s => s.id)), () => {});
    await depot.enregistrerReleveContenu({ id: 'vieux_7j', fiche: 'vieux', releve: '7j', date_publication: '2026-08-01T00:00:00.000Z' });
    await depot.enregistrerReleveContenu({ id: 'f1_7j', fiche: 'f1', releve: '7j', date_publication: '2026-09-20T00:00:00.000Z' });
    expect(recus.at(-1)).toEqual(['f1_7j']);
  });

  it('écrit et écoute les relevés du compte', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const recus = [];
    depot.ecouterRelevesCompte(l => recus.push(l), () => {});
    await depot.enregistrerReleveCompte({ id: '2026-W40', semaine: '2026-W40', debut: '2026-09-27T22:00:00.000Z', abonnes: 100 });
    expect(recus.at(-1)).toEqual([{ id: '2026-W40', semaine: '2026-W40', debut: '2026-09-27T22:00:00.000Z', abonnes: 100 }]);
  });
});
