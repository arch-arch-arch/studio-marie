import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { creerDepot } from '../../src/donnees/depot.js';
import { creerEnregistreur } from '../../src/donnees/enregistreur.js';
import { creerEtat } from '../../src/interface/etat.js';
import { creerControleur } from '../../src/interface/controleur.js';
import { aReevaluer } from '../../src/logique/fiche.js';

const T = '2026-09-28T08:00:00.000Z';
const REPONSE = {
  notes: { accroche: 8, voix: 7, mecanique: 6 },
  phrases: { accroche: 'A.', voix: 'V.', mecanique: 'M.' },
  conformite: { etat: 'vert', causes: [] },
  captions: [{ role: 'engagement', texte: 'Variante A' }, { role: 'deadpan', texte: 'Variante B' }],
  accroches: ['Acc 1', 'Acc 2'],
  hashtags: ['nuit', '#socio'],
  recommandations: ['R1', 'R2', 'R3'],
};
const differe = () => { let resoudre, rejeter; const p = new Promise((a, b) => { resoudre = a; rejeter = b; }); return { p, resoudre, rejeter }; };
const fauxSample = (json = async () => REPONSE, limits = async () => ({ maxPromptBytes: 65536 })) =>
  Object.assign(vi.fn(), { json: vi.fn(json), limits: vi.fn(limits) });

async function monter({
  sample = fauxSample(), chargerImage = vi.fn(async () => new Blob(['x'], { type: 'image/png' })), contenu = {}, envelopperDepot = d => d,
} = {}) {
  const db = creerFausseBase();
  const depot = envelopperDepot(creerDepot(db));
  const enregistreur = creerEnregistreur(f => depot.enregistrerFiche(f), 600);
  const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'semaine', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
  const actions = creerControleur({ etat, depot, enregistreur, assets: null, horloge: () => T, idAleatoire: () => 'f1', sample, chargerImage });
  await actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
  actions.modifierFiche('f1', {
    accroche: 'Tu relis ce message pour la troisième fois.', caption: 'Une ligne. Dis-moi en commentaire.',
    hashtags: ['nuit', 'socio', 'humour', 'paris'], visuel: 'a1', visuel_type: 'video', ...contenu,
  });
  await enregistreur.vider('f1');
  return { db, etat, actions, sample, chargerImage, depot };
}

describe('evaluerFiche', () => {
  it('évalue, enregistre le score et les suggestions, et permet de valider', async () => {
    const { db, etat, actions, sample } = await monter();
    const r = await actions.evaluerFiche('f1');
    expect(r.ok).toBe(true);
    expect(sample.json).toHaveBeenCalledTimes(1);
    expect(sample.json.mock.calls[0][0]).toContain('Tu relis ce message pour la troisième fois.');
    const enBase = db._docs.get('fiches/f1');
    expect(enBase.score.total).toBe(71);
    expect(enBase.variantes).toEqual(REPONSE.captions);
    expect(enBase.suggestions).toEqual({ accroches: ['Acc 1', 'Acc 2'], hashtags: ['nuit', 'socio'] });
    expect(enBase.recommandations).toEqual(['R1', 'R2', 'R3']);
    expect(etat.lire().fiches[0].score.total).toBe(71);
    expect(await actions.changerStatut('f1', 'valide')).toEqual({ ok: true });
  });

  it('garde le rouge calculé même si Claude répond vert, et refuse la validation', async () => {
    const { actions } = await monter({ contenu: { caption: 'Mon mindset du jour.' } });
    const r = await actions.evaluerFiche('f1');
    expect(r.fiche.score.conformite).toEqual({ etat: 'rouge', causes: ['mot à éviter « mindset »'] });
    expect(r.fiche.score.total).toBeLessThanOrEqual(40);
    expect(await actions.changerStatut('f1', 'valide')).toEqual({ ok: false, raison: 'Conformité au rouge : mot à éviter « mindset ».' });
  });

  it('une réponse incomplète ne modifie ni la fiche ni la base', async () => {
    const { db, etat, actions } = await monter({ sample: fauxSample(async () => ({ notes: {} })) });
    expect(await actions.evaluerFiche('f1')).toEqual({ ok: false, raison: 'La réponse de Claude était incomplète : réessaie. Rien n’a été modifié.' });
    expect(etat.lire().fiches[0].score).toBeNull();
    expect(db._docs.get('fiches/f1').score).toBeNull();
  });

  it('traduit un échec de Claude sans rien écrire', async () => {
    const { db, actions } = await monter({ sample: fauxSample(async () => { throw { code: 'invalid_json', message: 'x', text: 'bla' }; }) });
    const ecrituresAvant = db.ecritures.length;
    expect(await actions.evaluerFiche('f1')).toEqual({ ok: false, raison: 'La réponse de Claude était illisible : réessaie. Rien n’a été modifié.', indisponible: false });
    expect(db.ecritures.length).toBe(ecrituresAvant);
  });

  it('un arrêt demandé n’affiche pas d’erreur', async () => {
    const { etat, actions } = await monter({ sample: fauxSample(async () => { throw { code: 'cancelled', message: 'x' }; }) });
    expect(await actions.evaluerFiche('f1')).toEqual({ ok: false, annule: true });
    expect(etat.lire().erreur).toBeNull();
  });

  it('signale une évaluation indisponible', async () => {
    const { actions } = await monter({ sample: fauxSample(async () => { throw { code: 'not_granted', message: 'x' }; }) });
    expect(actions.evaluationDisponible()).toBe(true);
    expect(await actions.evaluerFiche('f1')).toMatchObject({ ok: false, indisponible: true });
    expect(actions.evaluationDisponible()).toBe(false);
    const sansSample = await monter({ sample: null });
    expect(await sansSample.actions.evaluerFiche('f1')).toEqual({ ok: false, raison: 'L’évaluation par Claude n’est pas disponible dans cette vue.', indisponible: true });
  });

  it('une modification pendant l’évaluation laisse la fiche à réévaluer', async () => {
    const reponse = differe();
    const { etat, actions } = await monter({ sample: fauxSample(() => reponse.p) });
    const enCours = actions.evaluerFiche('f1');
    await Promise.resolve();
    actions.modifierFiche('f1', { caption: 'Changée pendant l’évaluation.' });
    reponse.resoudre(REPONSE);
    const r = await enCours;
    expect(r.ok).toBe(true);
    expect(etat.lire().fiches[0].caption).toBe('Changée pendant l’évaluation.');
    expect(aReevaluer(etat.lire().fiches[0])).toBe(true);
    expect(await actions.changerStatut('f1', 'valide')).toEqual({ ok: false, raison: 'La fiche a changé depuis son évaluation : réévalue-la.' });
  });

  it('refuse une deuxième évaluation simultanée de la même fiche', async () => {
    const reponse = differe();
    const { actions } = await monter({ sample: fauxSample(() => reponse.p) });
    const premiere = actions.evaluerFiche('f1');
    expect(await actions.evaluerFiche('f1')).toEqual({ ok: false, raison: 'Une évaluation est déjà en cours pour cette fiche.' });
    reponse.resoudre(REPONSE);
    await premiere;
  });

  it('un changement de semaine pendant l’évaluation n’efface pas le résultat : il est écrit en base', async () => {
    const reponse = differe();
    const { db, etat, actions } = await monter({ sample: fauxSample(() => reponse.p) });
    const enCours = actions.evaluerFiche('f1');
    await Promise.resolve();
    etat.modifier({ fiches: [] });
    reponse.resoudre(REPONSE);
    const r = await enCours;
    expect(r.ok).toBe(true);
    expect(r.fiche.score.total).toBe(71);
    expect(etat.lire().fiches).toEqual([]);
    expect(db._docs.get('fiches/f1').score.total).toBe(71);
  });

  it('reprend le chemin normal si la fiche revient dans l’état pendant la relecture en base', async () => {
    const reponse = differe();
    const lectureAppelee = differe();
    const lectureDifferee = differe();
    const { db, etat, actions } = await monter({
      sample: fauxSample(() => reponse.p),
      envelopperDepot: depot => ({ ...depot, lireFiche: async id => { lectureAppelee.resoudre(); await lectureDifferee.p; return depot.lireFiche(id); } }),
    });
    const originale = etat.lire().fiches[0];
    const enCours = actions.evaluerFiche('f1');
    await Promise.resolve();
    etat.modifier({ fiches: [] });
    reponse.resoudre(REPONSE);
    await lectureAppelee.p;
    etat.modifier({ fiches: [{ ...originale, caption: 'EDITION RECENTE' }] });
    lectureDifferee.resoudre();
    const r = await enCours;
    expect(r.ok).toBe(true);
    expect(r.fiche.caption).toBe('EDITION RECENTE');
    expect(db._docs.get('fiches/f1').caption).toBe('EDITION RECENTE');
    expect(db._docs.get('fiches/f1').score.total).toBeGreaterThan(0);
  });

  it('ne ressuscite pas une fiche supprimée pendant la relecture en base', async () => {
    const reponse = differe();
    const suppressionDifferee = differe();
    const { db, actions } = await monter({
      sample: fauxSample(() => reponse.p),
      envelopperDepot: depot => ({ ...depot, supprimerFiche: async id => { await suppressionDifferee.p; return depot.supprimerFiche(id); } }),
    });
    const enCours = actions.evaluerFiche('f1');
    await Promise.resolve();
    const suppression = actions.supprimerFiche('f1');
    reponse.resoudre(REPONSE);
    const r = await enCours;
    expect(r).toEqual({ ok: false, raison: 'La fiche a été supprimée pendant l’évaluation.' });
    suppressionDifferee.resoudre();
    await suppression;
    expect(db._docs.has('fiches/f1')).toBe(false);
  });

  it('signale une fiche supprimée pendant l’évaluation', async () => {
    const reponse = differe();
    const { actions } = await monter({ sample: fauxSample(() => reponse.p) });
    const enCours = actions.evaluerFiche('f1');
    await actions.supprimerFiche('f1');
    reponse.resoudre(REPONSE);
    expect(await enCours).toEqual({ ok: false, raison: 'La fiche a été supprimée pendant l’évaluation.' });
  });

  it('joint le visuel image quand la vue le permet, et s’en passe sinon', async () => {
    const avecImages = fauxSample(undefined, async () => ({ maxPromptBytes: 65536, images: { maxCount: 1, maxInputBytes: 20e6, mediaTypes: ['image/png'] } }));
    const a = await monter({ sample: avecImages, contenu: { visuel_type: 'image' } });
    await a.actions.evaluerFiche('f1');
    expect(a.chargerImage).toHaveBeenCalledWith('a1');
    expect(avecImages.json.mock.calls[0][1].images).toBeInstanceOf(Blob);
    expect(avecImages.json.mock.calls[0][0]).toContain('"visuel":"joint à ce message"');

    const b = await monter({ contenu: { visuel_type: 'image' } });
    await b.actions.evaluerFiche('f1');
    expect(b.chargerImage).not.toHaveBeenCalled();

    const sampleEchec = fauxSample(undefined, async () => ({ images: { maxCount: 1 } }));
    const echec = vi.fn(async () => { throw new Error('404'); });
    const c = await monter({ sample: sampleEchec, chargerImage: echec, contenu: { visuel_type: 'image' } });
    expect((await c.actions.evaluerFiche('f1')).ok).toBe(true);
    expect(sampleEchec.json.mock.calls[0][1]).not.toHaveProperty('images');
  });

  it('ignore le visuel si son type ou sa taille ne correspond pas aux limites de la vue', async () => {
    const sampleType = fauxSample(undefined, async () => ({ images: { maxCount: 1, mediaTypes: ['image/jpeg'] } }));
    const png = vi.fn(async () => new Blob(['x'], { type: 'image/png' }));
    const a = await monter({ sample: sampleType, chargerImage: png, contenu: { visuel_type: 'image' } });
    await a.actions.evaluerFiche('f1');
    expect(sampleType.json.mock.calls[0][1]).not.toHaveProperty('images');
    expect(sampleType.json.mock.calls[0][0]).toContain('"visuel":"présent mais non joint"');

    const sampleTaille = fauxSample(undefined, async () => ({ images: { maxCount: 1, maxInputBytes: 1 } }));
    const gros = vi.fn(async () => new Blob(['xxxxxxxxxx'], { type: 'image/png' }));
    const b = await monter({ sample: sampleTaille, chargerImage: gros, contenu: { visuel_type: 'image' } });
    await b.actions.evaluerFiche('f1');
    expect(sampleTaille.json.mock.calls[0][1]).not.toHaveProperty('images');
  });

  it('signale un rate_limited sans relancer automatiquement', async () => {
    const sample = fauxSample(async () => { throw { code: 'rate_limited', message: 'x' }; });
    const { actions } = await monter({ sample });
    expect(await actions.evaluerFiche('f1')).toEqual({ ok: false, raison: 'Trop de demandes à Claude pour le moment : réessaie un peu plus tard.', indisponible: false });
    expect(sample.json).toHaveBeenCalledTimes(1);
  });

  it('refuse la validation si le géotag change après une évaluation au vert (verrou en profondeur)', async () => {
    const { actions } = await monter({ contenu: { geotag: 'Paris' } });
    await actions.evaluerFiche('f1');
    expect(await actions.changerStatut('f1', 'valide')).toEqual({ ok: true });
    actions.modifierFiche('f1', { geotag: '12 rue des Lilas' });
    expect((await actions.changerStatut('f1', 'valide')).ok).toBe(false);
  });

  it('refuse la validation si un profil réimporté ajoute un mot à éviter présent dans une fiche au score vert à jour', async () => {
    const { etat, actions } = await monter({ contenu: { caption: 'Une ligne sur lilas. Dis-moi en commentaire.' } });
    await actions.evaluerFiche('f1');
    expect(await actions.changerStatut('f1', 'valide')).toEqual({ ok: true });
    const profil = etat.lire().profil;
    etat.modifier({ profil: { ...profil, regles_studio: { ...profil.regles_studio, mots_a_eviter: [...profil.regles_studio.mots_a_eviter, 'lilas'] } } });
    const r = await actions.changerStatut('f1', 'valide');
    expect(r.ok).toBe(false);
    expect(r.raison).toMatch(/^Conformité au rouge :/);
  });

  it('repasse en brouillon si la conformité redevient rouge après la réévaluation d’une fiche validée', async () => {
    const sample = fauxSample();
    const { db, etat, actions } = await monter({ sample });
    await actions.evaluerFiche('f1');
    expect(await actions.changerStatut('f1', 'valide')).toEqual({ ok: true });
    sample.json.mockImplementationOnce(async () => ({ ...REPONSE, conformite: { etat: 'rouge', causes: ['groupe visé'] } }));
    const r = await actions.evaluerFiche('f1');
    expect(r.ok).toBe(true);
    expect(r.fiche.statut).toBe('brouillon');
    expect(etat.lire().fiches[0].statut).toBe('brouillon');
    expect(db._docs.get('fiches/f1').statut).toBe('brouillon');
  });
});
