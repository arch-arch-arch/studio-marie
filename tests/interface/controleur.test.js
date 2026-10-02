import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { creerDepot } from '../../src/donnees/depot.js';
import { creerEnregistreur } from '../../src/donnees/enregistreur.js';
import { creerEtat } from '../../src/interface/etat.js';
import { creerControleur, plageDeVue, fusionnerInstantane } from '../../src/interface/controleur.js';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import { construireExport, COLLECTIONS_EXPORT } from '../../src/logique/sauvegarde.js';

const T = '2026-09-28T08:00:00.000Z';
const FZ = 'Europe/Paris';

function monter({ assets = null, dossier = null, delaiAssistantMs } = {}) {
  const db = creerFausseBase();
  const depot = creerDepot(db);
  const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
  const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'semaine', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
  let n = 0;
  const actions = creerControleur({ etat, depot, enregistreur, assets, dossier, delaiAssistantMs, horloge: () => T, idAleatoire: () => `f${++n}` });
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

  it('invite à se reconnecter quand la session a expiré', async () => {
    const assets = { upload: vi.fn(async () => { throw Object.assign(new Error('x'), { code: 'revoked' }); }) };
    const avec = monter({ assets });
    await avec.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect(await avec.actions.televerserVisuel('f1', { type: 'image/png' }))
      .toEqual({ ok: false, raison: 'Ta session a expiré : reconnecte-toi puis réessaie.' });
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

describe('relevés de statistiques', () => {
  const avecFiche = statut => {
    const m = monter();
    const f = { ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: '2026-09-20T10:00:00.000Z', pilier: 'socio', maintenant: T }), statut, accroche: 'Accroche' };
    m.etat.modifier({ fiches: [f] });
    return { ...m, depot: creerDepot(m.db) };
  };
  const saisie = { vues: '100', nouveaux_abonnes: '1', partages_envois: '2' };

  it('refuse la saisie tant que la fiche n’est pas publiée', async () => {
    const { actions, depot } = avecFiche('programme');
    expect(await actions.enregistrerReleveContenu('f1', '48h', saisie))
      .toEqual({ ok: false, erreurs: ['Passe la fiche en « Publié » avant de saisir ses statistiques.'] });
    expect(await depot.lireRelevesFiche('f1')).toEqual([]);
  });

  it('enregistre le relevé d’une fiche publiée', async () => {
    const { actions, depot } = avecFiche('publie');
    const ok = await actions.enregistrerReleveContenu('f1', '48h', saisie);
    expect(ok.ok).toBe(true);
    expect(ok.releve).toMatchObject({ id: 'f1_48h', vues: 100, accroche: 'Accroche', date_publication: '2026-09-20T10:00:00.000Z' });
    expect((await depot.lireRelevesFiche('f1'))[0].vues).toBe(100);
    expect((await actions.lireRelevesFiche('f1')).releves).toHaveLength(1);
  });

  it('n’écrit rien si la saisie est invalide', async () => {
    const { actions, depot } = avecFiche('publie');
    const r = await actions.enregistrerReleveContenu('f1', '7j', { ...saisie, vues: 'abc' });
    expect(r).toEqual({ ok: false, erreurs: ['Vues : nombre entier positif attendu.'] });
    expect(await depot.lireRelevesFiche('f1')).toEqual([]);
  });

  it('refuse un relevé inconnu', async () => {
    const { actions } = avecFiche('publie');
    expect((await actions.enregistrerReleveContenu('f1', '30j', saisie)).erreurs).toEqual(['Relevé inconnu.']);
  });

  it('enregistre le relevé du compte de la semaine', async () => {
    const { actions } = monter();
    const r = await actions.enregistrerReleveCompte('2026-09-27T22:00:00.000Z', { abonnes: '1 500' });
    expect(r.ok).toBe(true);
    expect(r.releve).toMatchObject({ id: '2026-W40', abonnes: 1500, saisi_le: T });
  });

  it('allerAFiche passe en vue Semaine et ouvre la fiche', async () => {
    const { actions, etat } = avecFiche('publie');
    etat.modifier({ vue: 'mois' });
    await actions.allerAFiche('f1', '2026-09-20T10:00:00.000Z');
    expect(etat.lire()).toMatchObject({ vue: 'semaine', ancre: '2026-09-20T10:00:00.000Z', ficheOuverte: 'f1' });
  });

  it('expose l’horloge', () => {
    expect(monter().actions.maintenant()).toBe(T);
  });
});

describe('confirmations', () => {
  const prete = (extra = {}) => {
    const f = { ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: '2026-10-01T10:00:00.000Z', pilier: 'socio', maintenant: T }), visuel: 'a1', visuel_type: 'image', caption: 'Une caption.', statut: 'valide', ...extra };
    return { ...f, score: { total: 70, criteres: [], conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f) } };
  };
  const monte = extra => { const m = monter(); m.etat.modifier({ fiches: [prete(extra)] }); return { ...m, depot: creerDepot(m.db) }; };

  it('confirme la programmation, met à jour l’état et écrit en base', async () => {
    const { actions, etat, depot } = monte();
    const r = await actions.confirmerProgrammation('f1', '2026-10-02T09:00:00.000Z', true);
    expect(r.ok).toBe(true);
    expect(etat.lire().fiches[0]).toMatchObject({ statut: 'programme', programme_pour: '2026-10-02T09:00:00.000Z', date_heure: '2026-10-02T09:00:00.000Z' });
    expect(await depot.lireFiche('f1')).toMatchObject({ statut: 'programme', programme_pour: '2026-10-02T09:00:00.000Z' });
  });

  it('n’écrit rien quand la confirmation est refusée', async () => {
    const { actions, etat, db } = monte();
    expect(await actions.confirmerProgrammation('f1', '2026-10-02T09:00:00.000Z', false)).toEqual({ ok: false, raison: 'Coche la case pour confirmer.' });
    expect(await actions.confirmerProgrammation('f1', '2026-09-27T09:00:00.000Z', true)).toMatchObject({ ok: false });
    expect(await actions.confirmerPublication('f1', 'pas une date', true)).toEqual({ ok: false, raison: 'Indique une date et une heure valides.' });
    expect(etat.lire().fiches[0].statut).toBe('valide');
    expect(db.ecritures).toEqual([]);
  });

  it('confirme la publication directement depuis Validé', async () => {
    const { actions, etat } = monte();
    const r = await actions.confirmerPublication('f1', '2026-09-28T07:30:00.000Z', true);
    expect(r.ok).toBe(true);
    expect(etat.lire().fiches[0]).toMatchObject({ statut: 'publie', publie_le: '2026-09-28T07:30:00.000Z', programme_pour: null });
  });

  it('refuse une conformité devenue rouge avec le profil actuel', async () => {
    const { actions } = monte({ caption: 'Un mindset.' });
    const r = await actions.confirmerProgrammation('f1', '2026-10-02T09:00:00.000Z', true);
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/^Conformité au rouge : /);
  });

  it('changerStatut n’accepte plus Programmé ni Publié', async () => {
    const { actions } = monte();
    expect(await actions.changerStatut('f1', 'programme')).toEqual({ ok: false, raison: 'Utilise « Confirmer la programmation » dans la fiche.' });
    expect(await actions.changerStatut('f1', 'publie')).toEqual({ ok: false, raison: 'Utilise « Confirmer la publication » dans la fiche.' });
  });

  it('revenir en Validé efface la programmation', async () => {
    const { actions, etat } = monte();
    await actions.confirmerProgrammation('f1', '2026-10-02T09:00:00.000Z', true);
    expect(await actions.changerStatut('f1', 'valide')).toEqual({ ok: true });
    expect(etat.lire().fiches[0]).toMatchObject({ statut: 'valide', programme_pour: null });
  });

  it('déplacer une fiche programmée garde sa programmation', async () => {
    const { actions, etat } = monte();
    await actions.confirmerProgrammation('f1', '2026-10-01T10:00:00.000Z', true);
    await actions.deplacerFiche('f1', '2026-10-02T10:00:00.000Z');
    expect(etat.lire().fiches[0]).toMatchObject({ statut: 'programme', programme_pour: '2026-10-01T10:00:00.000Z', date_heure: '2026-10-02T10:00:00.000Z' });
  });

  it('une fiche programmée bloquée par le profil repasse en Brouillon sans confirmation', async () => {
    const { actions, etat } = monte();
    await actions.confirmerProgrammation('f1', '2026-10-02T09:00:00.000Z', true);
    const profil = etat.lire().profil;
    etat.modifier({ profil: { ...profil, regles_studio: { ...profil.regles_studio, mots_a_eviter: [...profil.regles_studio.mots_a_eviter, 'caption'] } } });
    await actions.reverifierFiches();
    expect(etat.lire().fiches[0]).toMatchObject({ statut: 'brouillon', programme_pour: null });
  });
});

describe('sauvegarde', () => {
  const avecDownloads = (save = vi.fn(async () => ({ status: 'saved' })), envelopper = d => d) => {
    const db = creerFausseBase();
    const depot = envelopper(creerDepot(db));
    const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
    const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'profil', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
    const downloads = { save };
    const actions = creerControleur({ etat, depot, enregistreur, assets: null, horloge: () => T, downloads });
    return { db, depot, etat, actions, downloads, enregistreur };
  };
  const exportAvec = docs => JSON.stringify(construireExport({ ...Object.fromEntries(COLLECTIONS_EXPORT.map(c => [c, []])), ...docs }, T));

  it('exporte toutes les collections via downloads', async () => {
    const { db, actions, downloads } = avecDownloads();
    await db.doc('fiches/f1').set({ accroche: 'x' });
    expect(await actions.exporterDonnees()).toEqual({ ok: true, message: 'Export enregistré.' });
    const { filename, data } = downloads.save.mock.calls[0][0];
    expect(filename).toBe('studio-contenu-2026-09-28.json');
    expect(JSON.parse(data).collections.fiches).toEqual([{ id: 'f1', data: { accroche: 'x' } }]);
  });

  it('traduit les refus de téléchargement', async () => {
    const refuse = avecDownloads(vi.fn(async () => { throw { code: 'declined' }; }));
    expect(await refuse.actions.exporterDonnees()).toEqual({ ok: false, raison: 'Export annulé.' });
    const indispo = avecDownloads(vi.fn(async () => { throw { code: 'unavailable' }; }));
    expect(await indispo.actions.exporterDonnees()).toEqual({ ok: false, raison: 'L’export n’est pas disponible dans cette vue.' });
    const m = monter();
    expect(await m.actions.exporterDonnees()).toEqual({ ok: false, raison: 'L’export n’est pas disponible dans cette vue.' });
  });

  it('analyse puis restaure sans rien supprimer', async () => {
    const { db, actions } = avecDownloads();
    await db.doc('fiches/garde').set({ accroche: 'reste' });
    const a = await actions.analyserRestauration(exportAvec({ fiches: [{ id: 'f1', data: { accroche: 'restaurée' } }] }));
    expect(a.ok).toBe(true);
    expect(a.resume).toContain('fiches : 1');
    const r = await actions.restaurerDonnees(a.validation, { sauvegarder: false });
    expect(r).toEqual({ ok: true, message: 'Restauration terminée : 1 document(s) restauré(s).', restaures: 1 });
    expect(db._docs.get('fiches/f1')).toEqual({ accroche: 'restaurée' });
    expect(db._docs.get('fiches/garde')).toEqual({ accroche: 'reste' });
  });

  it('refuse un texte illisible ou un autre format sans rien écrire', async () => {
    const { db, actions } = avecDownloads();
    expect(await actions.analyserRestauration('pas du json')).toEqual({ ok: false, erreurs: ['Ce fichier n’est pas du JSON valide.'] });
    expect((await actions.analyserRestauration('{"format":"autre"}')).erreurs).toEqual(['Ce fichier n’est pas un export du studio.']);
    expect(db.ecritures).toEqual([]);
  });

  it('sauvegarde d’abord, et n’écrit rien si la sauvegarde est refusée', async () => {
    const { db, actions, downloads } = avecDownloads(vi.fn(async () => { throw { code: 'declined' }; }));
    const a = await actions.analyserRestauration(exportAvec({ fiches: [{ id: 'f1', data: {} }] }));
    const r = await actions.restaurerDonnees(a.validation, { sauvegarder: true });
    expect(r).toEqual({ ok: false, erreurs: ['Sauvegarde préalable impossible : Export annulé. Rien n’a été restauré.'], restaures: 0 });
    expect(downloads.save).toHaveBeenCalledTimes(1);
    expect(db.ecritures).toEqual([]);
  });

  it('s’arrête sur une écriture en échec et donne le compteur', async () => {
    let n = 0;
    const { actions } = avecDownloads(undefined, d => ({ ...d, ecrireDocument: async (...args) => { n += 1; if (n === 2) throw new Error('x'); return d.ecrireDocument(...args); } }));
    const a = await actions.analyserRestauration(exportAvec({ fiches: [{ id: 'f1', data: {} }, { id: 'f2', data: {} }, { id: 'f3', data: {} }] }));
    expect(await actions.restaurerDonnees(a.validation, { sauvegarder: false })).toEqual({
      ok: false, restaures: 1,
      erreurs: ['Restauration interrompue après 1 document(s) sur 3 : réessaie, les documents déjà restaurés seront simplement réécrits.'],
    });
  });

  it('refuse une seconde opération pendant une restauration', async () => {
    let debloquer;
    const bloque = new Promise(r => { debloquer = r; });
    const { actions, downloads } = avecDownloads(undefined, d => ({ ...d, ecrireDocument: async (...args) => { await bloque; return d.ecrireDocument(...args); } }));
    const a = await actions.analyserRestauration(exportAvec({ fiches: [{ id: 'f1', data: {} }] }));
    const premiere = actions.restaurerDonnees(a.validation, { sauvegarder: false });
    const msg = 'Une opération de sauvegarde est déjà en cours : attends la fin.';
    expect(await actions.exporterDonnees()).toEqual({ ok: false, raison: msg });
    expect(await actions.restaurerDonnees(a.validation, { sauvegarder: false })).toEqual({ ok: false, erreurs: [msg], restaures: 0 });
    expect(downloads.save).not.toHaveBeenCalled();
    debloquer();
    expect((await premiere).ok).toBe(true);
    expect((await actions.exporterDonnees()).ok).toBe(true);
  });

  it('la sauvegarde préalable n’est pas bloquée par le verrou', async () => {
    const { actions, downloads } = avecDownloads();
    const a = await actions.analyserRestauration(exportAvec({ fiches: [{ id: 'f1', data: {} }] }));
    expect((await actions.restaurerDonnees(a.validation, { sauvegarder: true })).ok).toBe(true);
    expect(downloads.save).toHaveBeenCalledTimes(1);
  });

  it('écrit les modifications locales en attente avant de restaurer', async () => {
    const { db, actions, enregistreur } = avecDownloads();
    enregistreur.planifier({ id: 'f1', accroche: 'locale' });
    expect(db._docs.get('fiches/f1')).toBeUndefined();
    const a = await actions.analyserRestauration(exportAvec({ fiches: [{ id: 'f1', data: { accroche: 'exportée' } }] }));
    await actions.restaurerDonnees(a.validation, { sauvegarder: false });
    expect(db.ecritures).toEqual(['fiches/f1', 'fiches/f1']);
    expect(db._docs.get('fiches/f1')).toEqual({ accroche: 'exportée' });
  });
});

describe('urlVisuel', () => {
  it('utilise le lien signé du stockage, sinon le chemin d’Artifact', async () => {
    const avec = monter({ assets: { upload: vi.fn(), url: vi.fn(async id => `https://stockage.test/${id}`) } });
    expect(await avec.actions.urlVisuel('a.png')).toBe('https://stockage.test/a.png');
    const sans = monter({ assets: { upload: vi.fn() } });
    expect(await sans.actions.urlVisuel('a1')).toBe('/_blob/a1');
  });
});

describe('seDeconnecter', () => {
  const monterConnexion = (enregistrer = async () => {}) => {
    const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'profil', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
    const enregistreur = creerEnregistreur(enregistrer, 600);
    const ordre = [];
    const viderTout = enregistreur.viderTout;
    enregistreur.viderTout = async () => { ordre.push('vidage'); await viderTout(); };
    const connexion = { deconnecter: vi.fn(async () => { ordre.push('deconnexion'); }) };
    const actions = creerControleur({ etat, depot: {}, enregistreur, assets: null, horloge: () => T, connexion });
    return { etat, enregistreur, connexion, actions, ordre };
  };

  it('vide les écritures en attente puis déconnecte', async () => {
    const { actions, connexion, ordre, enregistreur } = monterConnexion();
    enregistreur.planifier({ id: 'f1', accroche: 'a' });
    await actions.seDeconnecter();
    expect(ordre).toEqual(['vidage', 'deconnexion']);
    expect(connexion.deconnecter).toHaveBeenCalledTimes(1);
  });
  it('ne déconnecte pas quand une écriture est en échec', async () => {
    const { actions, connexion, etat, enregistreur } = monterConnexion(async () => { throw { code: 'unavailable' }; });
    enregistreur.planifier({ id: 'f1', accroche: 'a' });
    await actions.seDeconnecter();
    expect(connexion.deconnecter).not.toHaveBeenCalled();
    expect(etat.lire().erreur).toBe('Des modifications ne sont pas encore enregistrées : attends le retour de la connexion avant de te déconnecter.');
  });
});

describe('relancerVeille', () => {
  it('délègue à la capacité veille, ou dit qu’elle manque', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
    const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'bulletin', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
    const veille = { relancer: vi.fn(async () => ({ ok: true, message: 'Fait.' })) };
    const avec = creerControleur({ etat, depot, enregistreur, assets: null, horloge: () => T, veille });
    expect(await avec.relancerVeille()).toEqual({ ok: true, message: 'Fait.' });
    expect(await monter().actions.relancerVeille()).toEqual({ ok: false, raison: 'La veille n’est pas encore configurée.' });
  });
  it('met l’état à jour avant et après, et refuse un second appel pendant la veille', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
    const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'bulletin', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
    let fin;
    const veille = { relancer: vi.fn(() => new Promise(r => { fin = r; })) };
    const actions = creerControleur({ etat, depot, enregistreur, assets: null, horloge: () => T, veille });
    const premier = actions.relancerVeille();
    expect(etat.lire().veille).toEqual({ enCours: true, message: 'Veille en cours : cela peut prendre quelques minutes.' });
    expect(await actions.relancerVeille()).toEqual({ ok: false, raison: 'Une veille est déjà en cours.' });
    expect(veille.relancer).toHaveBeenCalledTimes(1);
    fin({ ok: true, message: 'Fait.' });
    expect(await premier).toEqual({ ok: true, message: 'Fait.' });
    expect(etat.lire().veille).toEqual({ enCours: false, message: 'Fait.' });
    const suivant = actions.relancerVeille();
    fin({ ok: false, raison: 'Trop de demandes.' });
    await suivant;
    expect(etat.lire().veille).toEqual({ enCours: false, message: 'Trop de demandes.' });
  });
  it('remet l’état au repos avec un message d’échec si la capacité lève', async () => {
    const db = creerFausseBase();
    const depot = creerDepot(db);
    const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
    const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'bulletin', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
    const veille = { relancer: vi.fn(async () => { throw new Error('boum'); }) };
    const actions = creerControleur({ etat, depot, enregistreur, assets: null, horloge: () => T, veille });
    const r = await actions.relancerVeille();
    expect(r.ok).toBe(false);
    const attendu = 'La veille a échoué : réessaie dans quelques minutes. Rien n’a été modifié.';
    expect(r.raison).toBe(attendu);
    expect(etat.lire().veille).toEqual({ enCours: false, message: attendu });
  });
});

function fauxDossier({ cartes = () => ({ ok: true, carte: new Blob(['c'], { type: 'image/jpeg' }) }), pdfEchoue = false, partage = true, attente = null } = {}) {
  const appels = { demandes: null, contenu: null, partages: [], copies: [] };
  return {
    appels,
    fabrique: async () => ({
      preparerCartes: async demandes => { appels.demandes = demandes; return new Map(demandes.map(d => [d.ref, cartes(d)])); },
      assemblerPdf: async (contenu, lesCartes) => {
        if (attente) await attente;
        if (pdfEchoue) throw new Error('pdf');
        appels.contenu = contenu; appels.cartes = lesCartes;
        return new Blob(['%PDF'], { type: 'application/pdf' });
      },
    }),
    peutPartager: () => partage,
    partager: async fichier => { appels.partages.push(fichier); },
    copier: async texte => { appels.copies.push(texte); },
  };
}

const reponse = (code, refs, plus = {}) => '```json\n' + JSON.stringify({
  dossier: code,
  fiches: refs.map(id => ({
    id, notes: { accroche: 7, voix: 8, mecanique: 6 }, phrases: { accroche: 'a', voix: 'b', mecanique: 'c' },
    conformite: { etat: 'vert', causes: [] }, captions: [{ role: 'engagement', texte: 'A ?' }, { role: 'deadpan', texte: 'B.' }],
    accroches: ['Une', 'Deux'], hashtags: ['nuit'],
    recommandations: [{ texte: 'r1', pourquoi: 'p1' }, { texte: 'r2', pourquoi: 'p2' }, { texte: 'r3', pourquoi: 'p3' }],
  })),
  periode: { avis: 'Semaine correcte.', points_forts: ['x'], risques: ['y'], ordre_conseille: refs },
  ...plus,
}) + '\n```';

describe('analyse par dossier', () => {
  async function avecDeuxFiches(options) {
    const dossier = fauxDossier(options);
    const m = monter({ dossier, delaiAssistantMs: options?.delaiAssistantMs, assets: { upload: vi.fn(), telecharger: vi.fn(async () => new Blob(['i'], { type: 'image/png' })) } });
    await m.actions.creerFiche({ format: 'reel', date_heure: '2026-09-29T10:00:00.000Z' });
    await m.actions.creerFiche({ format: 'story', date_heure: '2026-09-30T10:00:00.000Z' });
    const [a, b] = m.etat.lire().fiches;
    m.actions.modifierFiche(a.id, { accroche: 'Première', caption: 'Texte', visuel: 'v1', visuel_type: 'image' });
    m.actions.modifierFiche(b.id, { accroche: 'Seconde', caption: 'Texte' });
    await m.actions.fermerPanneau();
    return { ...m, dossier, a: m.etat.lire().fiches.find(f => f.id === a.id), b: m.etat.lire().fiches.find(f => f.id === b.id) };
  }

  it('prépare le dossier, l’enregistre et le met à disposition', async () => {
    const { actions, etat, db, dossier, a, b } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const an = etat.lire().analyse;
    expect(an).toMatchObject({ etape: 'pret', nombre: 2, sansVisuel: [], nom: 'analyse-2026-W40.pdf' });
    expect(an.code).toMatch(/^D-/);
    expect(an.fichier.type).toBe('application/pdf');
    expect(dossier.appels.demandes).toEqual([{ ref: 'F01', etiquette: expect.stringContaining('F01'), visuel: 'v1', type: 'image' }]);
    expect(dossier.appels.contenu.fiches.map(f => f.ref)).toEqual(['F01', 'F02']);
    const doc = db.lire(`analyses/${an.code}`);
    expect(doc).toMatchObject({
      periode: { type: 'semaine', cle: '2026-W40' }, cree_le: T, assistant: 'inconnu',
      fiches: [{ ref: 'F01', id: a.id, empreinte: empreinte(a), visuel: 'joint', raison_visuel: null }, { ref: 'F02', id: b.id, empreinte: empreinte(b), visuel: 'aucun', raison_visuel: null }],
    });
    expect(doc.retour).toBeUndefined();
  });

  it('signale les fiches parties sans visuel et les erreurs de préparation', async () => {
    const sans = await avecDeuxFiches({ cartes: () => ({ ok: false }) });
    await sans.actions.ouvrirAnalyse();
    expect(sans.etat.lire().analyse.sansVisuel).toEqual(['F01']);
    const casse = await avecDeuxFiches({ pdfEchoue: true });
    await casse.actions.ouvrirAnalyse();
    expect(casse.etat.lire().analyse).toEqual({ etape: 'erreur', message: 'Le dossier n’a pas pu être préparé : réessaie.' });
    expect(casse.db.lister('analyses')).toEqual([]);
    const vide = monter({ dossier: fauxDossier() });
    await vide.actions.ouvrirAnalyse();
    expect(vide.etat.lire().analyse).toEqual({ etape: 'erreur', message: 'Aucune fiche à analyser sur cette période.' });
    const absent = monter();
    await absent.actions.ouvrirAnalyse();
    expect(absent.etat.lire().analyse).toEqual({ etape: 'erreur', message: 'L’analyse par dossier n’est pas disponible dans cette vue.' });
  });

  it('partage, télécharge et copie', async () => {
    const { actions, dossier } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    expect(await actions.partagerDossier()).toEqual({ ok: true, message: 'Dossier partagé.' });
    expect(dossier.appels.partages).toHaveLength(1);
    expect(await actions.copierMessage()).toEqual({ ok: true, message: 'Message copié.' });
    expect(dossier.appels.copies[0]).toContain('Voici le dossier d’analyse de mes contenus.');
    expect((await actions.telechargerDossier()).ok).toBe(false);
  });

  it('applique le retour à chaque fiche et garde l’avis de la période', async () => {
    const { actions, etat, db, a, b } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    await actions.noterAssistant('chatgpt');
    const r = await actions.enregistrerRetour(`Mon analyse…\n\nBloc à coller dans le studio :\n${reponse(code, ['F01', 'F02'])}`);
    expect(r).toEqual({ ok: true, appliquees: 2, ecartees: [], avisRecu: true });
    const fa = db.lire(`fiches/${a.id}`);
    expect(fa.score.total).toBeGreaterThan(0);
    expect(fa.score.examen).toMatchObject({ source: 'dossier', assistant: 'chatgpt', visuel: 'joint', contenus_semaine: 1, version_profil: 1 });
    expect(fa.recommandations).toHaveLength(3);
    expect(fa.variantes.map(v => v.role)).toEqual(['engagement', 'deadpan']);
    expect(db.lire(`fiches/${b.id}`).score.examen.visuel).toBe('aucun');
    expect(db.lire(`analyses/${code}`).retour).toMatchObject({ recu_le: T, avis: 'Semaine correcte.', ordre_conseille: ['F01', 'F02'], appliquees: [a.id, b.id], ecartees: [] });
    expect(etat.lire().analyse.retour).toEqual(r);
  });

  it('écarte une fiche modifiée ou supprimée depuis le dossier', async () => {
    const { actions, etat, db, a, b } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    actions.modifierFiche(a.id, { accroche: 'Autre accroche' });
    await actions.supprimerFiche(b.id);
    const r = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r).toEqual({ ok: true, appliquees: 0, avisRecu: true, ecartees: [
      { ref: 'F01', raison: 'fiche modifiée depuis le dossier : refais une analyse' },
      { ref: 'F02', raison: 'fiche supprimée depuis le dossier' },
    ] });
    expect(db.lire(`fiches/${a.id}`)?.score ?? null).toBeNull();
  });

  it('n’écrit rien pour un retour illisible ou d’un autre dossier', async () => {
    const { actions, etat, db } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    const avant = JSON.stringify([...db._docs]);
    const ecrituresAvant = db.ecritures.length;
    expect((await actions.enregistrerRetour('Bonjour')).ok).toBe(false);
    expect(await actions.enregistrerRetour(reponse('D-zzzzzz', ['F01']))).toEqual({ ok: false, raison: 'Ce retour ne correspond à aucun dossier produit par le studio.' });
    expect(db.lire(`analyses/${code}`).retour).toBeUndefined();
    expect(db.ecritures).toHaveLength(ecrituresAvant);
    expect(JSON.stringify([...db._docs])).toBe(avant);
  });

  it('garde un blocage calculé malgré un avis vert', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    const interdit = etat.lire().profil.regles_studio.mots_a_eviter[0];
    actions.modifierFiche(a.id, { caption: `Texte avec ${interdit}` });
    await actions.fermerPanneau();
    await actions.ouvrirAnalyse();
    await actions.enregistrerRetour(reponse(etat.lire().analyse.code, ['F01', 'F02']));
    expect(db.lire(`fiches/${a.id}`).score.conformite.etat).toBe('rouge');
  });

  it('reprend après un échec d’écriture, sans doublon', async () => {
    const { actions, etat, db, a, b } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    db.echouerEcritures(`fiches/${b.id}`);
    const r1 = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r1).toEqual({ ok: false, raison: 'L’enregistrement a été interrompu après 1 fiche sur 2 : réessaie, les fiches déjà notées seront simplement réécrites.' });
    expect(db.lire(`analyses/${code}`).retour).toBeUndefined();
    db.echouerEcritures(null);
    const r2 = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r2).toMatchObject({ ok: true, appliquees: 2 });
    expect(db.lister('fiches')).toHaveLength(2);
    expect(db.lire(`analyses/${code}`).retour.appliquees).toEqual([a.id, b.id]);
  });

  it('accepte deux fois le même retour : mêmes fiches, aucune écartée', async () => {
    const { actions, etat, db } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const texte = reponse(etat.lire().analyse.code, ['F01', 'F02']);
    const r1 = await actions.enregistrerRetour(texte);
    const r2 = await actions.enregistrerRetour(texte);
    expect(r1).toEqual({ ok: true, appliquees: 2, ecartees: [], avisRecu: true });
    expect(r2).toEqual(r1);
    expect(db.lister('fiches')).toHaveLength(2);
  });

  it('applique le retour à une fiche qui n’est plus dans l’état (autre semaine)', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    await actions.naviguer(1);
    etat.modifier({ fiches: [] });
    const r = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r).toMatchObject({ ok: true, appliquees: 2, ecartees: [] });
    expect(db.lire(`fiches/${a.id}`).score.total).toBeGreaterThan(0);
  });

  it('retrouve le dossier par son code quand le panneau est fermé', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    actions.fermerAnalyse();
    expect(etat.lire().analyse).toBeNull();
    const r = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r).toMatchObject({ ok: true, appliquees: 2 });
    expect(db.lire(`fiches/${a.id}`).score.examen.source).toBe('dossier');
    expect(etat.lire().analyse).toBeNull();
  });

  it('garde l’assistant noté dans le document quand le panneau est fermé', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    await actions.noterAssistant('chatgpt');
    expect(db.lire(`analyses/${code}`).assistant).toBe('chatgpt');
    actions.fermerAnalyse();
    await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(db.lire(`fiches/${a.id}`).score.examen.assistant).toBe('chatgpt');
  });

  it('enregistre un retour sans avis de période', async () => {
    const { actions, etat, db } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    const r = await actions.enregistrerRetour(reponse(code, ['F01', 'F02'], { periode: 'rien' }));
    expect(r).toEqual({ ok: true, appliquees: 2, ecartees: [], avisRecu: false });
    expect(db.lire(`analyses/${code}`).retour).toMatchObject({ avis: '', points_forts: [], risques: [], ordre_conseille: [] });
  });

  it('repasse en brouillon une fiche validée dont le score devient rouge', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    const interdit = etat.lire().profil.regles_studio.mots_a_eviter[0];
    etat.modifier({ fiches: etat.lire().fiches.map(f => (f.id === a.id ? { ...f, statut: 'valide', caption: `Texte avec ${interdit}` } : f)) });
    await actions.ouvrirAnalyse();
    await actions.enregistrerRetour(reponse(etat.lire().analyse.code, ['F01', 'F02']));
    expect(db.lire(`fiches/${a.id}`).statut).toBe('brouillon');
  });

  const INTERROMPU = n => `L’enregistrement a été interrompu après ${n} fiche${n > 1 ? 's' : ''} sur 2 : réessaie, les fiches déjà notées seront simplement réécrites.`;
  const SESSION = { ok: false, raison: 'Ta session a expiré : recharge la page pour te reconnecter.' };
  const synchroniserAnalyses = (etat, db) => etat.modifier({ analyses: db.lister('analyses').map(chemin => ({ id: chemin.split('/')[1], ...db.lire(chemin) })) });

  it('protège la saisie en attente d’une fiche sortie de l’état', async () => {
    const { actions, etat, db, enregistreur, a } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    actions.modifierFiche(a.id, { caption: 'Nouvelle saisie' });
    db.echouerEcritures(`fiches/${a.id}`);
    etat.modifier({ fiches: etat.lire().fiches.filter(f => f.id !== a.id) });
    const r = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/^L’enregistrement a été interrompu après 0 fiche sur /);
    expect(db.lire(`fiches/${a.id}`).score ?? null).toBeNull();
    db.echouerEcritures(null);
    await enregistreur.vider(a.id);
    expect(db.lire(`fiches/${a.id}`).caption).toBe('Nouvelle saisie');
  });

  it('rend un message quand la lecture d’une fiche ou du dossier échoue', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    etat.modifier({ fiches: [] });
    db.echouerLectures(`fiches/${a.id}`);
    const r = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/^L’enregistrement a été interrompu/);
    db.echouerLectures(`fiches/${a.id}`, 'revoked');
    expect(await actions.enregistrerRetour(reponse(code, ['F01', 'F02']))).toEqual(SESSION);
    db.echouerLectures(`analyses/${code}`, 'revoked');
    expect(await actions.enregistrerRetour(reponse(code, ['F01', 'F02']))).toEqual(SESSION);
    db.echouerLectures(`analyses/${code}`);
    expect((await actions.enregistrerRetour(reponse(code, ['F01', 'F02']))).raison).toMatch(/pas pu lire le dossier/);
  });

  it('écarte une fiche publiée depuis le dossier', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    etat.modifier({ fiches: etat.lire().fiches.map(f => (f.id === a.id ? { ...f, statut: 'publie' } : f)) });
    const r = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r).toEqual({ ok: true, appliquees: 1, avisRecu: true, ecartees: [{ ref: 'F01', raison: 'fiche publiée depuis le dossier' }] });
    expect(db.lire(`fiches/${a.id}`)?.score ?? null).toBeNull();
  });

  it('compte dans le message d’échec les seules fiches à noter', async () => {
    const { actions, etat, db, a, b } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    actions.modifierFiche(a.id, { accroche: 'Autre accroche' });
    db.echouerEcritures(`fiches/${b.id}`);
    const r = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r).toEqual({ ok: false, raison: 'L’enregistrement a été interrompu après 0 fiche sur 1 : réessaie, les fiches déjà notées seront simplement réécrites.' });
  });

  it('ignore une seconde ouverture pendant la préparation', async () => {
    let libere;
    const attente = new Promise(r => { libere = r; });
    const { actions, db } = await avecDeuxFiches({ attente });
    const p1 = actions.ouvrirAnalyse();
    const p2 = actions.ouvrirAnalyse();
    libere();
    await Promise.all([p1, p2]);
    expect(db.lister('analyses')).toHaveLength(1);
  });

  it('abandonne une préparation fermée en cours de route', async () => {
    let libere;
    const attente = new Promise(r => { libere = r; });
    const { actions, etat, db } = await avecDeuxFiches({ attente });
    const p = actions.ouvrirAnalyse();
    actions.fermerAnalyse();
    libere();
    await p;
    expect(etat.lire().analyse).toBeNull();
    expect(db.lister('analyses')).toEqual([]);
  });

  it('réutilise le dossier identique sans retour, pas un dossier devenu périmé', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const premier = etat.lire().analyse.code;
    synchroniserAnalyses(etat, db);
    await actions.ouvrirAnalyse();
    expect(etat.lire().analyse.code).toBe(premier);
    expect(db.lister('analyses')).toHaveLength(1);
    actions.modifierFiche(a.id, { accroche: 'Changée' });
    synchroniserAnalyses(etat, db);
    await actions.ouvrirAnalyse();
    expect(etat.lire().analyse.code).not.toBe(premier);
    expect(db.lister('analyses')).toHaveLength(2);
  });

  it('ne réutilise pas un dossier qui a déjà reçu son retour', async () => {
    const { actions, etat, db } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const premier = etat.lire().analyse.code;
    await actions.enregistrerRetour(reponse(premier, ['F01', 'F02']));
    synchroniserAnalyses(etat, db);
    await actions.ouvrirAnalyse();
    expect(etat.lire().analyse.code).not.toBe(premier);
  });

  it('ne perd pas un assistant noté pendant l’application du retour', async () => {
    const m = await avecDeuxFiches();
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    const vider = m.enregistreur.vider;
    let fait = false;
    let note = null;
    m.enregistreur.vider = async id => {
      if (!fait) { fait = true; note = m.actions.noterAssistant('chatgpt'); }
      return vider(id);
    };
    await m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    await note;
    expect(m.db.lire(`analyses/${code}`).assistant).toBe('chatgpt');
    expect(m.db.lire(`analyses/${code}`).retour.appliquees).toHaveLength(2);
  });

  it('noterAssistant ne lève jamais', async () => {
    const { actions, etat, db } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    db.echouerLectures(`analyses/${code}`);
    await expect(actions.noterAssistant('claude')).resolves.toBeUndefined();
    db.echouerLectures(null);
    db.echouerEcritures(`analyses/${code}`);
    await expect(actions.noterAssistant('claude')).resolves.toBeUndefined();
  });

  it('garde l’avis déjà reçu quand un nouveau retour n’en a pas', async () => {
    const { actions, etat, db } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    const r = await actions.enregistrerRetour(reponse(code, ['F01', 'F02'], { periode: 'rien' }));
    expect(r.avisRecu).toBe(false);
    expect(db.lire(`analyses/${code}`).retour).toMatchObject({ avis: 'Semaine correcte.', points_forts: ['x'], risques: ['y'], ordre_conseille: ['F01', 'F02'], appliquees: expect.any(Array) });
  });

  // Agit une seule fois, juste avant l'écriture de la première fiche notée.
  const agirPendantEcriture = (m, action) => {
    const vider = m.enregistreur.vider;
    let fait = false;
    m.enregistreur.vider = async id => {
      if (!fait) { fait = true; await action(); }
      return vider(id);
    };
  };

  it('(A) garde la saisie faite sur une fiche pendant l’écriture de la précédente', async () => {
    const m = await avecDeuxFiches();
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    agirPendantEcriture(m, () => m.actions.modifierFiche(m.b.id, { caption: 'Saisie tardive' }));
    const r = await m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r).toEqual({ ok: true, appliquees: 1, avisRecu: true, ecartees: [{ ref: 'F02', raison: 'fiche modifiée depuis le dossier : refais une analyse' }] });
    expect(m.etat.lire().fiches.find(f => f.id === m.b.id).caption).toBe('Saisie tardive');
    await m.enregistreur.vider(m.b.id);
    expect(m.db.lire(`fiches/${m.b.id}`).caption).toBe('Saisie tardive');
    expect(m.db.lire(`fiches/${m.b.id}`).score ?? null).toBeNull();
  });

  it('(B) ne réécrit pas une fiche supprimée pendant l’écriture de la précédente', async () => {
    const m = await avecDeuxFiches();
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    agirPendantEcriture(m, () => m.actions.supprimerFiche(m.b.id));
    const r = await m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r).toEqual({ ok: true, appliquees: 1, avisRecu: true, ecartees: [{ ref: 'F02', raison: 'fiche supprimée depuis le dossier' }] });
    await m.enregistreur.viderTout();
    expect(m.db.lire(`fiches/${m.b.id}`)).toBeUndefined();
  });

  it('(C) garde la nouvelle date d’une fiche déplacée pendant l’écriture de la précédente', async () => {
    const m = await avecDeuxFiches();
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    agirPendantEcriture(m, () => m.actions.deplacerFiche(m.b.id, '2026-10-01T10:00:00.000Z'));
    const r = await m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r).toEqual({ ok: true, appliquees: 2, avisRecu: true, ecartees: [] });
    const enBase = m.db.lire(`fiches/${m.b.id}`);
    expect(enBase.date_heure.startsWith('2026-10-01')).toBe(true);
    expect(enBase.score.total).toBeGreaterThan(0);
  });

  it('écarte une fiche publiée pendant l’écriture de la précédente', async () => {
    const m = await avecDeuxFiches();
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    agirPendantEcriture(m, () => m.etat.modifier({ fiches: m.etat.lire().fiches.map(f => (f.id === m.b.id ? { ...f, statut: 'publie' } : f)) }));
    const r = await m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r.ecartees).toEqual([{ ref: 'F02', raison: 'fiche publiée depuis le dossier' }]);
  });

  it('ne réutilise pas un dossier dont le retour est arrivé en base après l’état', async () => {
    const { actions, etat, db } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const premier = etat.lire().analyse.code;
    synchroniserAnalyses(etat, db);
    await actions.enregistrerRetour(reponse(premier, ['F01', 'F02']));
    const retour = db.lire(`analyses/${premier}`).retour;
    expect(retour).toBeDefined();
    // l'état est en retard : il montre toujours le dossier sans retour
    etat.modifier({ analyses: etat.lire().analyses.map(a => ({ ...a, retour: undefined })) });
    await actions.ouvrirAnalyse();
    expect(etat.lire().analyse.code).not.toBe(premier);
    expect(db.lire(`analyses/${premier}`).retour).toEqual(retour);
  });

  it('prend un nouveau code quand la relecture du dossier à réutiliser échoue', async () => {
    const { actions, etat, db } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const premier = etat.lire().analyse.code;
    synchroniserAnalyses(etat, db);
    db.echouerLectures(`analyses/${premier}`);
    await actions.ouvrirAnalyse();
    expect(etat.lire().analyse.code).not.toBe(premier);
  });

  it('applique un assistant noté sans attendre avant le retour', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    const note = actions.noterAssistant('chatgpt');
    const r = await actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    await note;
    expect(r.ok).toBe(true);
    expect(db.lire(`analyses/${code}`)).toMatchObject({ assistant: 'chatgpt', retour: { appliquees: expect.any(Array) } });
    expect(db.lire(`fiches/${a.id}`).score.examen.assistant).toBe('chatgpt');
  });
  // Écoute des fiches branchée comme dans app.js : une fiche qui sort de la plage affichée sort de l'état.
  function brancherEcoute(m) {
    const depot = creerDepot(m.db);
    let cle = '';
    let arret = null;
    const maj = e => {
      const [debut, fin] = plageDeVue(e.vue, e.ancre, FZ);
      if (`${debut}|${fin}` === cle) return;
      cle = `${debut}|${fin}`;
      arret?.();
      arret = depot.ecouterFiches(debut, fin, recues => m.etat.modifier({ fiches: fusionnerInstantane(recues, m.etat.lire().fiches, m.enregistreur.estEnAttente) }), () => {});
    };
    m.etat.abonner(maj);
    maj(m.etat.lire());
  }
  const dansEtat = (m, id) => m.etat.lire().fiches.some(f => f.id === id);

  it('(D) note à sa nouvelle date une fiche déplacée vers une autre semaine pendant l’écriture', async () => {
    const m = await avecDeuxFiches();
    brancherEcoute(m);
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    agirPendantEcriture(m, () => m.actions.deplacerFiche(m.b.id, '2026-10-06T10:00:00.000Z'));
    const r = await m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(dansEtat(m, m.b.id)).toBe(false);
    expect(r).toEqual({ ok: true, appliquees: 2, avisRecu: true, ecartees: [] });
    const enBase = m.db.lire(`fiches/${m.b.id}`);
    expect(enBase.date_heure.startsWith('2026-10-06')).toBe(true);
    expect(enBase.score.total).toBeGreaterThan(0);
  });

  it('(E) garde la saisie d’une fiche sortie de l’état par un changement de semaine', async () => {
    const m = await avecDeuxFiches();
    brancherEcoute(m);
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    agirPendantEcriture(m, async () => {
      m.actions.modifierFiche(m.b.id, { caption: 'Saisie avant changement de semaine' });
      await m.enregistreur.vider(m.b.id);
      await m.actions.naviguer(1);
    });
    const r = await m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(dansEtat(m, m.b.id)).toBe(false);
    expect(r.ecartees).toEqual([{ ref: 'F02', raison: 'fiche modifiée depuis le dossier : refais une analyse' }]);
    await m.enregistreur.viderTout();
    expect(m.db.lire(`fiches/${m.b.id}`).caption).toBe('Saisie avant changement de semaine');
    expect(m.db.lire(`fiches/${m.b.id}`).score ?? null).toBeNull();
  });

  it('(F) ne ressuscite pas une fiche supprimée depuis un autre appareil', async () => {
    const m = await avecDeuxFiches();
    brancherEcoute(m);
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    agirPendantEcriture(m, () => m.db.doc(`fiches/${m.b.id}`).delete());
    const r = await m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(dansEtat(m, m.b.id)).toBe(false);
    expect(r).toEqual({ ok: true, appliquees: 1, avisRecu: true, ecartees: [{ ref: 'F02', raison: 'fiche supprimée depuis le dossier' }] });
    await m.enregistreur.viderTout();
    expect(m.db.lire(`fiches/${m.b.id}`)).toBeUndefined();
  });

  it('interrompt (sans écarter à tort) une fiche sortie de l’état dont l’écriture reste en attente', async () => {
    const m = await avecDeuxFiches();
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    m.actions.modifierFiche(m.a.id, { caption: 'En attente' });
    m.db.echouerEcritures(`fiches/${m.a.id}`);
    m.etat.modifier({ fiches: m.etat.lire().fiches.filter(f => f.id !== m.a.id) });
    const r = await m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/interrompu/);
  });

  it('retire du total du message d’interruption les fiches écartées pendant l’écriture', async () => {
    const m = await avecDeuxFiches();
    await m.actions.creerFiche({ format: 'post', date_heure: '2026-10-01T10:00:00.000Z' });
    const c = m.etat.lire().fiches.at(-1);
    m.actions.modifierFiche(c.id, { accroche: 'Troisième', caption: 'T' });
    await m.actions.fermerPanneau();
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    agirPendantEcriture(m, () => m.actions.modifierFiche(m.b.id, { caption: 'Autre saisie' }));
    m.db.echouerEcritures(`fiches/${c.id}`);
    const r = await m.actions.enregistrerRetour(reponse(code, ['F01', 'F02', 'F03']));
    expect(r).toEqual({ ok: false, raison: 'L’enregistrement a été interrompu après 1 fiche sur 2 : réessaie, les fiches déjà notées seront simplement réécrites.' });
  });

  it('n’écrit pas le dossier si le panneau est fermé pendant l’attente dans la file', async () => {
    const m = await avecDeuxFiches();
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    synchroniserAnalyses(m.etat, m.db);
    let liberer;
    const porte = new Promise(r => { liberer = r; });
    agirPendantEcriture(m, () => porte);
    const retour = m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    const ouverture = m.actions.ouvrirAnalyse();
    await new Promise(r => setTimeout(r, 30));
    m.actions.fermerAnalyse();
    liberer();
    await Promise.all([retour, ouverture]);
    expect(m.db.ecritures.filter(c => c === `analyses/${code}`)).toHaveLength(2);
    expect(m.etat.lire().analyse).toBeNull();
  });

  it('garde le retour arrivé pendant que l’ouverture attend d’écrire le dossier', async () => {
    const m = await avecDeuxFiches();
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    synchroniserAnalyses(m.etat, m.db);
    let liberer;
    const porte = new Promise(r => { liberer = r; });
    agirPendantEcriture(m, () => porte);
    const retour = m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    const ouverture = m.actions.ouvrirAnalyse();
    await new Promise(r => setTimeout(r, 30));
    liberer();
    await Promise.all([retour, ouverture]);
    expect(m.etat.lire().analyse.code).toBe(code);
    expect(m.db.lire(`analyses/${code}`).retour).toMatchObject({ appliquees: expect.any(Array) });
    expect(m.db.lire(`analyses/${code}`).retour.appliquees).toHaveLength(2);
  });

  it('accepte deux collages lancés ensemble, sans doublon', async () => {
    const { actions, etat, db } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const texte = reponse(etat.lire().analyse.code, ['F01', 'F02']);
    const [r1, r2] = await Promise.all([actions.enregistrerRetour(texte), actions.enregistrerRetour(texte)]);
    expect(r1).toEqual({ ok: true, appliquees: 2, ecartees: [], avisRecu: true });
    expect(r2).toEqual(r1);
    expect(db.lister('fiches')).toHaveLength(2);
  });

  it('noterAssistant suspendu ne bloque pas indéfiniment la file du dossier', async () => {
    const { actions, etat, db } = await avecDeuxFiches({ delaiAssistantMs: 40 });
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    const liberer = db.bloquerLectures(`analyses/${code}`);
    const note = actions.noterAssistant('claude');
    const retour = actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    await expect(note).resolves.toBeUndefined();
    liberer();
    const r = await retour;
    expect(r).toMatchObject({ ok: true, appliquees: 2 });
    expect(db.lire(`analyses/${code}`).assistant).toBe('inconnu');
  });
  const avecCaptions = (code, captions) => {
    const o = JSON.parse(reponse(code, ['F01', 'F02']).replace(/^```json\n|\n```$/g, ''));
    o.fiches[0].captions = captions;
    return `\`\`\`json\n${JSON.stringify(o)}\n\`\`\``;
  };

  it('passe finale C1 : garde l’analyse quand une caption a un rôle inconnu, et rend la remarque', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    const r = await actions.enregistrerRetour(avecCaptions(code, [{ role: 'envoi', texte: 'x' }, { role: 'cta', texte: 'y' }]));
    const remarques = [{ ref: 'F01', texte: 'variante de caption écartée : rôle inconnu envoi' }];
    expect(r).toEqual({ ok: true, appliquees: 2, ecartees: [], avisRecu: true, remarques });
    expect(db.lire(`fiches/${a.id}`).variantes).toEqual([{ role: 'cta', texte: 'y' }]);
    expect(db.lire(`fiches/${a.id}`).score.total).toBeGreaterThan(0);
    expect(db.lire(`analyses/${code}`).retour).toMatchObject({ appliquees: [a.id, expect.any(String)], remarques });
    expect(etat.lire().analyse.retour).toEqual(r);
  });

  it('passe finale C1 : aucune variante quand les deux rôles sont inconnus', async () => {
    const { actions, etat, db, a } = await avecDeuxFiches();
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    const r = await actions.enregistrerRetour(avecCaptions(code, [{ role: 'envoi', texte: 'x' }, { role: 'relance', texte: 'y' }]));
    expect(r.appliquees).toBe(2);
    expect(r.remarques).toEqual([{ ref: 'F01', texte: 'variante de caption écartée : rôle inconnu envoi, relance' }]);
    expect(db.lire(`fiches/${a.id}`).variantes).toEqual([]);
  });

  it('passe finale C2 : une écriture lente de l’assistant est attendue, le retour collé ensuite est conservé', async () => {
    const { actions, etat, db } = await avecDeuxFiches({ delaiAssistantMs: 30 });
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    const doc = db.doc;
    let lent = true;
    db.doc = chemin => {
      const d = doc(chemin);
      if (chemin !== `analyses/${code}`) return d;
      return { ...d, set: async corps => { if (lent) { lent = false; await new Promise(r => setTimeout(r, 150)); } return d.set(corps); } };
    };
    const note = actions.noterAssistant('chatgpt');
    const retour = actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    await note;
    const r = await retour;
    expect(r).toMatchObject({ ok: true, appliquees: 2 });
    await new Promise(res => setTimeout(res, 200));
    expect(db.lire(`analyses/${code}`)).toMatchObject({ assistant: 'chatgpt', retour: { appliquees: expect.any(Array) } });
  });

  it('passe finale C3 : une session révoquée pendant la préparation ou l’écriture du dossier donne le message de session', async () => {
    const revoque = Object.assign(new Error('révoquée'), { code: 'revoked' });
    const m1 = await avecDeuxFiches();
    m1.dossier.fabrique = async () => { throw revoque; };
    await m1.actions.ouvrirAnalyse();
    expect(m1.etat.lire().analyse).toEqual({ etape: 'erreur', message: 'Ta session a expiré : recharge la page pour te reconnecter.' });
    const m2 = await avecDeuxFiches();
    const doc = m2.db.doc;
    m2.db.doc = chemin => { const d = doc(chemin); return chemin.startsWith('analyses/') ? { ...d, set: async () => { throw revoque; } } : d; };
    await m2.actions.ouvrirAnalyse();
    expect(m2.etat.lire().analyse).toEqual({ etape: 'erreur', message: 'Ta session a expiré : recharge la page pour te reconnecter.' });
  });

  it('passe finale C4 : interrompt quand une fiche sort de l’état avec une écriture en attente pendant l’écriture de la précédente', async () => {
    const m = await avecDeuxFiches();
    await m.actions.ouvrirAnalyse();
    const { code } = m.etat.lire().analyse;
    agirPendantEcriture(m, () => {
      m.actions.modifierFiche(m.b.id, { caption: 'En attente' });
      m.db.echouerEcritures(`fiches/${m.b.id}`);
      m.etat.modifier({ fiches: m.etat.lire().fiches.filter(f => f.id !== m.b.id) });
    });
    const r = await m.actions.enregistrerRetour(reponse(code, ['F01', 'F02']));
    expect(r).toEqual({ ok: false, raison: INTERROMPU(1) });
    expect(m.db.lire(`analyses/${code}`).retour).toBeUndefined();
  });

});

describe('analyse par dossier : interface', () => {
  async function avecFiche(options) {
    const dossier = fauxDossier(options);
    const m = monter({ dossier });
    await m.actions.creerFiche({ format: 'reel', date_heure: '2026-09-29T10:00:00.000Z' });
    m.actions.modifierFiche(m.etat.lire().fiches[0].id, { accroche: 'Première', caption: 'Texte' });
    return { ...m, dossier };
  }
  it('dit si le partage est possible une fois le dossier prêt', async () => {
    const oui = await avecFiche();
    expect(oui.actions.peutPartagerDossier()).toBe(false);
    await oui.actions.ouvrirAnalyse();
    expect(oui.actions.peutPartagerDossier()).toBe(true);
    const non = await avecFiche({ partage: false });
    await non.actions.ouvrirAnalyse();
    expect(non.actions.peutPartagerDossier()).toBe(false);
  });
  it('ferme la fiche ouverte avant de préparer l’analyse', async () => {
    const { actions, etat } = await avecFiche();
    expect(etat.lire().ficheOuverte).toBeTruthy();
    await actions.ouvrirAnalyse();
    expect(etat.lire().ficheOuverte).toBeNull();
    expect(etat.lire().analyse.etape).toBe('pret');
  });
});

describe('analyse par dossier : retour sans dossier prêt et saisie récente', () => {
  async function avecFiche(options) {
    const dossier = fauxDossier(options);
    const m = monter({ dossier });
    await m.actions.creerFiche({ format: 'reel', date_heure: '2026-09-29T10:00:00.000Z' });
    return { ...m, dossier };
  }
  it('ouvrirRetour ferme la fiche ouverte et passe à l’étape retour', async () => {
    const { actions, etat } = await avecFiche();
    expect(etat.lire().ficheOuverte).toBeTruthy();
    actions.ouvrirRetour();
    expect(etat.lire().ficheOuverte).toBeNull();
    expect(etat.lire().analyse).toEqual({ etape: 'retour' });
  });
  it('ouvrirRetour annule une préparation en cours', async () => {
    let libere;
    const attente = new Promise(r => { libere = r; });
    const { actions, etat, db } = await avecFiche({ attente });
    actions.modifierFiche(etat.lire().fiches[0].id, { accroche: 'A', caption: 'B' });
    const p = actions.ouvrirAnalyse();
    actions.ouvrirRetour();
    libere();
    await p;
    expect(etat.lire().analyse).toEqual({ etape: 'retour' });
    expect(db.lister('analyses')).toEqual([]);
  });
  it('retrouve le dossier par son code après ouvrirRetour', async () => {
    const { actions, etat, db } = await avecFiche();
    actions.modifierFiche(etat.lire().fiches[0].id, { accroche: 'A', caption: 'B' });
    await actions.ouvrirAnalyse();
    const { code } = etat.lire().analyse;
    actions.ouvrirRetour();
    const r = await actions.enregistrerRetour(reponse(code, ['F01']));
    expect(r).toMatchObject({ ok: true, appliquees: 1 });
    expect(etat.lire().analyse).toEqual({ etape: 'retour' });
    expect(db.lire(`analyses/${code}`).retour.avis).toBe('Semaine correcte.');
  });
  it('prépare le dossier avec la saisie faite dans la fiche ouverte', async () => {
    const { actions, etat, db, dossier } = await avecFiche();
    const id = etat.lire().fiches[0].id;
    actions.modifierFiche(id, { accroche: 'Saisie toute fraîche', caption: 'Texte saisi' });
    expect(etat.lire().ficheOuverte).toBe(id);
    await actions.ouvrirAnalyse();
    expect(etat.lire().ficheOuverte).toBeNull();
    const { code } = etat.lire().analyse;
    expect(db.lire(`analyses/${code}`).fiches[0].empreinte).toBe(empreinte(etat.lire().fiches[0]));
    expect(etat.lire().fiches[0].accroche).toBe('Saisie toute fraîche');
    expect(JSON.stringify(dossier.appels.contenu)).toContain('Saisie toute fraîche');
  });
});
