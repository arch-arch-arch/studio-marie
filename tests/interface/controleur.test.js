import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { creerDepot } from '../../src/donnees/depot.js';
import { creerEnregistreur } from '../../src/donnees/enregistreur.js';
import { creerEtat } from '../../src/interface/etat.js';
import { creerControleur, plageDeVue, fusionnerInstantane } from '../../src/interface/controleur.js';

const T = '2026-09-28T08:00:00.000Z';
const FZ = 'Europe/Paris';

function monter({ assets = null } = {}) {
  const db = creerFausseBase();
  const depot = creerDepot(db);
  const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
  const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'semaine', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
  let n = 0;
  const actions = creerControleur({ etat, depot, enregistreur, assets, horloge: () => T, idAleatoire: () => `f${++n}` });
  return { db, etat, actions, enregistreur };
}

describe('plageDeVue', () => {
  it('couvre la semaine, le mois et le jour', () => {
    expect(plageDeVue('semaine', T, FZ)).toEqual(['2026-09-27T22:00:00.000Z', '2026-10-04T22:00:00.000Z']);
    expect(plageDeVue('jour', T, FZ)).toEqual(['2026-09-27T22:00:00.000Z', '2026-09-28T22:00:00.000Z']);
    expect(plageDeVue('mois', '2026-10-15T10:00:00.000Z', FZ)).toEqual(['2026-09-27T22:00:00.000Z', '2026-11-01T23:00:00.000Z']);
  });
});

describe('fusionnerInstantane', () => {
  it('garde la version locale des fiches en cours d’enregistrement', () => {
    const recues = [{ id: 'a', accroche: 'ancienne' }, { id: 'b', accroche: 'b' }];
    const locales = [{ id: 'a', accroche: 'nouvelle' }, { id: 'c', accroche: 'pas encore en base' }];
    const enAttente = id => id === 'a' || id === 'c';
    expect(fusionnerInstantane(recues, locales, enAttente)).toEqual([
      { id: 'a', accroche: 'nouvelle' }, { id: 'b', accroche: 'b' }, { id: 'c', accroche: 'pas encore en base' },
    ]);
  });
});

describe('creerControleur', () => {
  it('crée une fiche, l’enregistre et l’ouvre', async () => {
    const { db, etat, actions } = monter();
    const f = await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect(f).toMatchObject({ id: 'f1', pilier: 'socio', statut: 'idee' });
    expect(etat.lire().ficheOuverte).toBe('f1');
    expect(db._docs.has('fiches/f1')).toBe(true);
  });

  it('fermer le panneau enregistre la dernière saisie', async () => {
    const { db, actions } = monter();
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    actions.modifierFiche('f1', { accroche: 'dernière saisie' });
    await actions.fermerPanneau();
    expect(db._docs.get('fiches/f1').accroche).toBe('dernière saisie');
  });

  it('changer de période enregistre aussi la saisie en cours', async () => {
    const { db, actions, etat } = monter();
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    actions.modifierFiche('f1', { caption: 'tapée juste avant' });
    await actions.naviguer(1);
    expect(db._docs.get('fiches/f1').caption).toBe('tapée juste avant');
    expect(etat.lire().ancre).toBe('2026-10-05T08:00:00.000Z');
    expect(etat.lire().ficheOuverte).toBeNull();
  });

  it('un déplacement juste après une saisie garde la saisie et la nouvelle date', async () => {
    const { db, actions } = monter();
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    actions.modifierFiche('f1', { accroche: 'saisie' });
    await actions.deplacerFiche('f1', '2026-09-29T22:00:00.000Z');
    expect(db._docs.get('fiches/f1')).toMatchObject({ accroche: 'saisie', date_heure: '2026-09-30T10:00:00.000Z' });
  });

  it('refuse une validation impossible et affiche la raison', async () => {
    const { etat, actions } = monter();
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    const r = await actions.changerStatut('f1', 'valide');
    expect(r).toEqual({ ok: false, raison: 'Ajoute un visuel avant de valider.' });
    expect(etat.lire().erreur).toBe('Ajoute un visuel avant de valider.');
    expect(etat.lire().fiches[0].statut).toBe('idee');
  });

  it('supprime sans qu’une écriture en attente ne ressuscite la fiche', async () => {
    const { db, actions, etat } = monter();
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    actions.modifierFiche('f1', { accroche: 'x' });
    await actions.supprimerFiche('f1');
    await new Promise(r => setTimeout(r, 650));
    expect(db._docs.has('fiches/f1')).toBe(false);
    expect(etat.lire().fiches).toEqual([]);
    expect(etat.lire().ficheOuverte).toBeNull();
  });

  it('téléverse un visuel ou explique pourquoi c’est impossible', async () => {
    const sans = monter();
    await sans.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect(await sans.actions.televerserVisuel('f1', { type: 'image/png' })).toEqual({ ok: false, raison: 'Le téléversement n’est pas disponible dans cette vue.' });

    const assets = { upload: vi.fn(async () => ({ id: 'asset1', url: '/_blob/asset1' })) };
    const avec = monter({ assets });
    await avec.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect(await avec.actions.televerserVisuel('f1', { type: 'video/mp4' })).toEqual({ ok: true, id: 'asset1', type: 'video', statut: 'idee' });
    expect(avec.etat.lire().fiches[0]).toMatchObject({ visuel: 'asset1', visuel_type: 'video' });
  });

  it('signale qu’une fiche supprimée entre-temps ne peut plus recevoir de visuel', async () => {
    const assets = { upload: vi.fn(async () => ({ id: 'asset1', url: '/_blob/asset1' })) };
    const avec = monter({ assets });
    await avec.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    await avec.actions.supprimerFiche('f1');
    expect(await avec.actions.televerserVisuel('f1', { type: 'video/mp4' }))
      .toEqual({ ok: false, raison: 'La fiche n’existe plus : le visuel n’a pas été rattaché.' });
  });

  it('importe un profil depuis du texte et signale le JSON invalide', async () => {
    const { actions, db } = monter();
    expect((await actions.importerProfil('{pas du json')).erreurs[0]).toMatch(/^Ce texte n’est pas du JSON valide/);
    expect(await actions.importerProfil(JSON.stringify(fictif))).toMatchObject({ ok: true, version: 1 });
    expect(db._docs.get('profil/courant')).toMatchObject({ version: 1 });
  });

  it('refuse un champ protégé sans lever et affiche l’erreur', async () => {
    const { actions, etat } = monter();
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect(actions.modifierFiche('f1', { statut: 'valide' })).toBeNull();
    expect(etat.lire().erreur).toBe('Champ protégé : statut');
  });

  it('signale un message clair si l’import échoue en base', async () => {
    const etat = creerEtat({ profil: undefined, fiches: [], vue: 'profil', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
    const depotEnPanne = { importerProfil: async () => { throw { code: 'unavailable' }; } };
    const enregistreur = creerEnregistreur(() => Promise.resolve(), 600);
    const actions = creerControleur({ etat, depot: depotEnPanne, enregistreur, assets: null, horloge: () => T });
    const r = await actions.importerProfil(JSON.stringify(fictif));
    expect(r).toEqual({ ok: false, erreurs: ['L’import a échoué : la base du studio ne répond pas. Réessaie dans un instant.'] });
  });

  it('traduit les codes d’erreur de téléversement', async () => {
    const assets = { upload: vi.fn().mockRejectedValue({ code: 'too_large' }) };
    const { actions } = monter({ assets });
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect(await actions.televerserVisuel('f1', { type: 'image/png' }))
      .toEqual({ ok: false, raison: 'Fichier trop lourd (20 Mo au maximum).' });
  });

  it('signale un message si la suppression échoue en base', async () => {
    const reelle = creerFausseBase();
    const db = {
      ...reelle,
      doc(chemin) {
        const d = reelle.doc(chemin);
        if (chemin !== 'fiches/f1') return d;
        return { ...d, delete: async () => { throw { code: 'unavailable' }; } };
      },
    };
    const depot = creerDepot(db);
    const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
    const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'semaine', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
    const actions = creerControleur({ etat, depot, enregistreur, assets: null, horloge: () => T, idAleatoire: () => 'f1' });
    await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    await actions.supprimerFiche('f1');
    expect(etat.lire().erreur).toBe('La suppression a échoué : réessaie dans un instant.');
    expect(etat.lire().fiches).toEqual([]);
    expect(etat.lire().ficheOuverte).toBeNull();
  });
});
