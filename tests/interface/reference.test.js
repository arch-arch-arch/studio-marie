// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import jeu from '../../exemples/reference-fictive.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { creerDepot } from '../../src/donnees/depot.js';
import { creerEnregistreur } from '../../src/donnees/enregistreur.js';
import { creerEtat } from '../../src/interface/etat.js';
import { creerControleur } from '../../src/interface/controleur.js';
import { vueProfil } from '../../src/interface/vue-profil.js';
import { demarrer } from '../../src/interface/app.js';

const T = '2026-09-28T08:00:00.000Z';
const horloge = () => T;
const note = n => ({
  notes: { accroche: n, voix: n, mecanique: n }, phrases: { accroche: 'a', voix: 'v', mecanique: 'm' },
  conformite: { etat: 'vert', causes: [] }, captions: [{ role: 'engagement', texte: 'x' }, { role: 'deadpan', texte: 'y' }],
  accroches: ['a', 'b'], hashtags: ['h'], recommandations: ['1', '2', '3'],
});
const gagnants = new Set(jeu.filter(i => i.resultat === 'gagnant').map(i => i.accroche));
const sampleClasseur = () => Object.assign(vi.fn(), {
  limits: async () => ({}),
  json: vi.fn(async prompt => note([...gagnants].some(a => prompt.includes(a)) ? 9 : 3)),
});

function monter(sample = sampleClasseur()) {
  const db = creerFausseBase();
  const depot = creerDepot(db);
  const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'profil', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok', reference: [], resultatReference: null, verificationReference: null });
  depot.ecouterReference(reference => etat.modifier({ reference }));
  depot.ecouterResultatReference(resultatReference => etat.modifier({ resultatReference }));
  const actions = creerControleur({ etat, depot, enregistreur: creerEnregistreur(f => depot.enregistrerFiche(f), 600), assets: null, horloge: () => T, sample });
  return { db, etat, actions, sample };
}

describe('jeu de référence (contrôleur)', () => {
  it('importe un jeu valide et refuse un JSON invalide', async () => {
    const { etat, actions } = monter();
    expect((await actions.importerReference('{oups')).erreurs[0]).toMatch(/^Ce texte n’est pas du JSON valide/);
    expect(await actions.importerReference(JSON.stringify(jeu))).toEqual({ ok: true, erreurs: [], nombre: 6 });
    expect(etat.lire().reference).toHaveLength(6);
  });

  it('refuse d’importer pendant qu’une vérification est en cours', async () => {
    const sample = Object.assign(vi.fn(), {
      limits: async () => ({}),
      json: vi.fn((prompt, { signal }) => new Promise((ok, ko) => signal.addEventListener('abort', () => ko({ code: 'cancelled', message: 'x' })))),
    });
    const { actions } = monter(sample);
    await actions.importerReference(JSON.stringify(jeu));
    const enCours = actions.verifierReference();
    await vi.waitFor(() => expect(sample.json).toHaveBeenCalledTimes(1));
    expect(await actions.importerReference(JSON.stringify(jeu))).toEqual({
      ok: false, erreurs: ['Une vérification est en cours : attends la fin ou arrête-la avant d’importer.'],
    });
    actions.arreterReference();
    await enCours;
  });

  it('vérifie le classement et enregistre le bilan', async () => {
    const { db, etat, actions, sample } = monter();
    await actions.importerReference(JSON.stringify(jeu));
    const r = await actions.verifierReference();
    expect(r.ok).toBe(true);
    expect(r.bilan).toMatchObject({ taux: 1, paires: 9, ok: true, version_profil: 1, verifie_le: T });
    expect(sample.json).toHaveBeenCalledTimes(6);
    expect(db._docs.get('reference_resultats/dernier')).toMatchObject({ taux: 1, ok: true });
    expect(etat.lire().verificationReference).toBeNull();
  });

  it('s’arrête à la première erreur, l’affiche et n’enregistre pas de bilan', async () => {
    const sample = Object.assign(vi.fn(), { limits: async () => ({}), json: vi.fn().mockResolvedValueOnce(note(9)).mockRejectedValueOnce({ code: 'rate_limited', message: 'x' }) });
    const { db, etat, actions } = monter(sample);
    await actions.importerReference(JSON.stringify(jeu));
    expect(await actions.verifierReference()).toEqual({ ok: false, raison: 'Trop de demandes à Claude pour le moment : réessaie un peu plus tard.' });
    expect(sample.json).toHaveBeenCalledTimes(2);
    expect(etat.lire().erreur).toBe('Trop de demandes à Claude pour le moment : réessaie un peu plus tard.');
    expect(db._docs.has('reference_resultats/dernier')).toBe(false);
  });

  it('peut être arrêtée', async () => {
    const sample = Object.assign(vi.fn(), {
      limits: async () => ({}),
      json: vi.fn((prompt, { signal }) => new Promise((ok, ko) => signal.addEventListener('abort', () => ko({ code: 'cancelled', message: 'x' })))),
    });
    const { etat, actions } = monter(sample);
    await actions.importerReference(JSON.stringify(jeu));
    const enCours = actions.verifierReference();
    await vi.waitFor(() => expect(sample.json).toHaveBeenCalledTimes(1));
    actions.arreterReference();
    expect(await enCours).toEqual({ ok: false, annule: true });
    expect(etat.lire().erreur).toBeNull();
  });

  it('refuse sans jeu importé ou sans Claude', async () => {
    expect(await monter().actions.verifierReference()).toEqual({ ok: false, raison: 'Importe d’abord un jeu de référence.' });
    expect((await monter(null).actions.verifierReference()).raison).toBe('L’évaluation par Claude n’est pas disponible dans cette vue.');
  });

  it('efface le bilan précédent dès qu’un nouveau jeu est importé', async () => {
    const { db, actions } = monter();
    await actions.importerReference(JSON.stringify(jeu));
    await actions.verifierReference();
    expect(db._docs.has('reference_resultats/dernier')).toBe(true);
    await actions.importerReference(JSON.stringify(jeu));
    expect(db._docs.has('reference_resultats/dernier')).toBe(false);
  });

  it('vérifie l’arrêt avant de lancer l’évaluation suivante, même si l’appel en cours se termine normalement', async () => {
    let resoudrePremier;
    const premier = new Promise(resolve => { resoudrePremier = resolve; });
    const sample = Object.assign(vi.fn(), {
      limits: async () => ({}),
      json: vi.fn()
        .mockImplementationOnce(async () => { await premier; return note(9); })
        .mockImplementation(async () => note(9)),
    });
    const { etat, actions } = monter(sample);
    await actions.importerReference(JSON.stringify(jeu));
    const enCours = actions.verifierReference();
    await vi.waitFor(() => expect(sample.json).toHaveBeenCalledTimes(1));
    actions.arreterReference();
    resoudrePremier();
    expect(await enCours).toEqual({ ok: false, annule: true });
    expect(sample.json).toHaveBeenCalledTimes(1);
    expect(etat.lire().erreur).toBeNull();
  });

  it('importe quand même si l’ancien bilan n’a pas pu être effacé, avec un message dédié', async () => {
    const db = creerFausseBase();
    const depot = { ...creerDepot(db), effacerResultatReference: async () => { throw new Error('boom'); } };
    const etat = creerEtat({ profil: { ...fictif, version: 1 }, fiches: [], vue: 'profil', ancre: T, ficheOuverte: null, erreur: null, sauvegarde: 'ok', reference: [], resultatReference: null, verificationReference: null });
    depot.ecouterReference(reference => etat.modifier({ reference }));
    const actions = creerControleur({ etat, depot, enregistreur: creerEnregistreur(f => depot.enregistrerFiche(f), 600), assets: null, horloge: () => T, sample: null });
    expect(await actions.importerReference(JSON.stringify(jeu))).toEqual({
      ok: true, erreurs: ['Jeu importé, mais l’ancien bilan n’a pas pu être effacé.'], nombre: 6,
    });
    expect(etat.lire().reference).toHaveLength(6);
  });

  it('affiche un message clair et n’enregistre rien si l’évaluation lève une exception inattendue', async () => {
    const sample = Object.assign(vi.fn(), { limits: async () => ({}), json: vi.fn(async () => note(9)) });
    const { db, etat, actions } = monter(sample);
    await actions.importerReference(JSON.stringify(jeu));
    const profilSansCreneaux = { ...etat.lire().profil, regles_studio: { ...etat.lire().profil.regles_studio, creneaux: undefined } };
    etat.modifier({ profil: profilSansCreneaux });
    expect(await actions.verifierReference()).toEqual({ ok: false, raison: 'La vérification a échoué : réessaie. Rien n’a été enregistré.' });
    expect(etat.lire().erreur).toBe('La vérification a échoué : réessaie. Rien n’a été enregistré.');
    expect(db._docs.has('reference_resultats/dernier')).toBe(false);
  });
});

describe('jeu de référence (vue Profil)', () => {
  const etatVue = extra => ({ profil: { ...fictif, version: 1, importe_le: T }, reference: [], resultatReference: null, verificationReference: null, ...extra });
  const actions = () => ({ importerProfil: vi.fn(), importerReference: vi.fn(async () => ({ ok: true, erreurs: [], nombre: 6 })), verifierReference: vi.fn(async () => ({ ok: true })), arreterReference: vi.fn() });
  const items = jeu.map((i, n) => ({ ...i, id: `r${n + 1}` }));

  it('résume le jeu et propose la vérification seulement avec Claude', () => {
    const a = actions();
    const avec = vueProfil(etatVue({ reference: items }), a, { sample: true });
    expect(avec.textContent).toContain('6 contenus (3 gagnants, 3 perdants)');
    const lancer = [...avec.querySelectorAll('button')].find(b => b.textContent.startsWith('Vérifier le classement'));
    expect(lancer.textContent).toBe('Vérifier le classement (6 évaluations sur ton compte Claude)');
    lancer.click();
    expect(a.verifierReference).toHaveBeenCalled();
    const sans = vueProfil(etatVue({ reference: items }), actions(), { sample: false });
    expect([...sans.querySelectorAll('button')].some(b => b.textContent.startsWith('Vérifier le classement'))).toBe(false);
  });

  it('affiche la progression, le bouton Arrêter et le dernier bilan', () => {
    const a = actions();
    const el = vueProfil(etatVue({
      reference: items, verificationReference: { fait: 2, total: 6 },
      resultatReference: { taux: 0.75, ok: false, paires: 4, inversions: [{ gagnant: 'r2', perdant: 'r4' }], resultats: [{ id: 'r2', accroche: 'G2' }, { id: 'r4', accroche: 'P4' }], version_profil: 1, verifie_le: T },
    }), a, { sample: true });
    expect(el.textContent).toContain('Vérification en cours : 2/6');
    [...el.querySelectorAll('button')].find(b => b.textContent === 'Arrêter').click();
    expect(a.arreterReference).toHaveBeenCalled();
    expect(el.textContent).toContain('75 % des paires bien classées (seuil 80 %) : à recalibrer.');
    expect(el.textContent).toContain('« G2 » n’est pas au-dessus de « P4 »');
  });

  it('affiche la date du bilan dans le fuseau du profil', () => {
    const bilan = { taux: 1, ok: true, paires: 1, inversions: [], resultats: [], version_profil: 1, verifie_le: T };
    const profilTokyo = { ...fictif, version: 1, importe_le: T, regles_studio: { ...fictif.regles_studio, fuseau: 'Asia/Tokyo' } };
    const el = vueProfil({ profil: profilTokyo, reference: items, resultatReference: bilan, verificationReference: null }, actions(), { sample: true });
    const attendu = new Date(T).toLocaleString('fr-FR', { timeZone: 'Asia/Tokyo' });
    expect(el.textContent).toContain(`Vérifié le ${attendu}`);
  });

  it('importe un jeu collé', async () => {
    const a = actions();
    const el = vueProfil(etatVue(), a, { sample: true });
    el.querySelector('#reference-json').value = JSON.stringify(jeu);
    [...el.querySelectorAll('button')].find(b => b.textContent === 'Importer ce jeu').click();
    await vi.waitFor(() => expect(a.importerReference).toHaveBeenCalledWith(JSON.stringify(jeu)));
  });

  it('affiche les erreurs sous le message de réussite quand l’import réussit avec un avertissement', async () => {
    const a = { ...actions(), importerReference: vi.fn(async () => ({ ok: true, erreurs: ['Jeu importé, mais l’ancien bilan n’a pas pu être effacé.'], nombre: 6 })) };
    const el = vueProfil(etatVue(), a, { sample: true });
    el.querySelector('#reference-json').value = JSON.stringify(jeu);
    [...el.querySelectorAll('button')].find(b => b.textContent === 'Importer ce jeu').click();
    await vi.waitFor(() => expect(el.textContent).toContain('6 contenus importés.'));
    expect(el.textContent).toContain('Jeu importé, mais l’ancien bilan n’a pas pu être effacé.');
  });

  it('désactive « Importer ce jeu » pendant une vérification', () => {
    const el = vueProfil(etatVue({ reference: items, verificationReference: { fait: 1, total: 6 } }), actions(), { sample: true });
    const importer = [...el.querySelectorAll('button')].find(b => b.textContent === 'Importer ce jeu');
    expect(importer.disabled).toBe(true);
  });
});

describe('jeu de référence (stabilité de la vue Profil dans l’application)', () => {
  async function demarrerAvecProfil() {
    const db = creerFausseBase();
    const sample = sampleClasseur();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'sample' ? sample : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    app.actions.changerVue('profil', T);
    await app.actions.importerReference(JSON.stringify(jeu));
    return { db, sample, racine, app };
  }

  it('garde la zone de texte de la référence intacte pendant une progression', async () => {
    const { racine, app } = await demarrerAvecProfil();
    const zone = racine.querySelector('#reference-json');
    zone.value = 'texte collé pendant la vérification';
    app.etat.modifier({ verificationReference: { fait: 1, total: 6 } });
    expect(racine.querySelector('#reference-json')).toBe(zone);
    expect(zone.value).toBe('texte collé pendant la vérification');
    expect(racine.textContent).toContain('Vérification en cours : 1/6');
  });

  it('affiche le message de confirmation d’import après un import réel', async () => {
    const { racine, app } = await demarrerAvecProfil();
    const zone = racine.querySelector('#reference-json');
    zone.value = JSON.stringify(jeu);
    [...racine.querySelectorAll('button')].find(b => b.textContent === 'Importer ce jeu').click();
    await vi.waitFor(() => expect(racine.textContent).toContain('6 contenus importés.'));
  });

  it('garde le profil collé intact quand une fiche arrive pendant qu’on est sur l’onglet Profil', async () => {
    const { db, racine } = await demarrerAvecProfil();
    const zone = racine.querySelector('#profil-json');
    zone.value = 'texte collé dans le profil';
    await db.doc('fiches/x').set({ date_heure: T, format: 'reel' });
    expect(racine.querySelector('#profil-json')).toBe(zone);
    expect(zone.value).toBe('texte collé dans le profil');
  });
});

describe('section Sauvegarde', () => {
  const actionsSauvegarde = extra => ({
    importerProfil: vi.fn(), importerReference: vi.fn(), verifierReference: vi.fn(), arreterReference: vi.fn(),
    exporterDonnees: vi.fn(async () => ({ ok: true, message: 'Export enregistré.' })),
    analyserRestauration: vi.fn(async () => ({ ok: true, resume: 'À restaurer : fiches : 1 (total 1 document).', validation: { total: 1 } })),
    restaurerDonnees: vi.fn(async () => ({ ok: true, message: 'Restauration terminée : 1 document(s) restauré(s).', restaures: 1 })),
    ...extra,
  });
  const fichierJson = texte => ({ text: async () => texte, name: 'export.json' });
  const choisir = async (v, texte) => {
    const input = v.querySelector('.section-sauvegarde input[type="file"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [fichierJson(texte)] });
    input.dispatchEvent(new Event('change'));
  };

  it('exporte et affiche le message', async () => {
    const a = actionsSauvegarde();
    const v = vueProfil({ profil: fictif }, a, { downloads: true });
    [...v.querySelectorAll('.section-sauvegarde button')].find(b => b.textContent === 'Exporter les données').click();
    await vi.waitFor(() => expect(v.querySelector('.section-sauvegarde').textContent).toContain('Export enregistré.'));
  });

  it('masque l’export sans downloads mais garde la restauration', () => {
    const v = vueProfil({ profil: fictif }, actionsSauvegarde(), { downloads: false });
    expect([...v.querySelectorAll('.section-sauvegarde button')].some(b => b.textContent === 'Exporter les données')).toBe(false);
    expect(v.querySelector('.section-sauvegarde').textContent).toContain('L’export n’est pas disponible dans cette vue.');
    expect(v.querySelector('.section-sauvegarde input[type="file"]')).not.toBeNull();
  });

  it('montre l’aperçu puis restaure après sauvegarde', async () => {
    const a = actionsSauvegarde();
    const v = vueProfil({ profil: fictif }, a, { downloads: true });
    await choisir(v, '{}');
    await vi.waitFor(() => expect(v.querySelector('.section-sauvegarde').textContent).toContain('À restaurer : fiches : 1'));
    [...v.querySelectorAll('.section-sauvegarde button')].find(b => b.textContent === 'Sauvegarder l’état actuel puis restaurer').click();
    await vi.waitFor(() => expect(a.restaurerDonnees).toHaveBeenCalledWith({ total: 1 }, { sauvegarder: true }));
    await vi.waitFor(() => expect(v.querySelector('.section-sauvegarde').textContent).toContain('Restauration terminée : 1 document(s) restauré(s).'));
  });

  it('sans downloads, seule la restauration sans sauvegarde est proposée', async () => {
    const a = actionsSauvegarde();
    const v = vueProfil({ profil: fictif }, a, { downloads: false });
    await choisir(v, '{}');
    await vi.waitFor(() => expect([...v.querySelectorAll('.section-sauvegarde button')].map(b => b.textContent)).toContain('Restaurer sans sauvegarde'));
    expect([...v.querySelectorAll('.section-sauvegarde button')].map(b => b.textContent)).not.toContain('Sauvegarder l’état actuel puis restaurer');
  });

  it('affiche les erreurs d’un fichier invalide', async () => {
    const a = actionsSauvegarde({ analyserRestauration: vi.fn(async () => ({ ok: false, erreurs: ['Ce fichier n’est pas un export du studio.'] })) });
    const v = vueProfil({ profil: fictif }, a, { downloads: true });
    await choisir(v, '{}');
    await vi.waitFor(() => expect(v.querySelector('.section-sauvegarde').textContent).toContain('Ce fichier n’est pas un export du studio.'));
    expect(a.restaurerDonnees).not.toHaveBeenCalled();
  });

  it('désactive l’input et les boutons pendant une restauration, puis les réactive', async () => {
    let fin;
    const a = actionsSauvegarde({ restaurerDonnees: vi.fn(() => new Promise(r => { fin = () => r({ ok: true, message: 'Restauration terminée : 1 document(s) restauré(s).', restaures: 1 }); })) });
    const v = vueProfil({ profil: fictif }, a, { downloads: true });
    await choisir(v, '{}');
    await vi.waitFor(() => expect(v.querySelector('.section-sauvegarde').textContent).toContain('À restaurer'));
    const boutons = () => [...v.querySelectorAll('.section-sauvegarde button')];
    boutons().find(b => b.textContent === 'Restaurer sans sauvegarde').click();
    await vi.waitFor(() => expect(a.restaurerDonnees).toHaveBeenCalled());
    expect(v.querySelector('.section-sauvegarde input[type="file"]').disabled).toBe(true);
    expect(boutons().length).toBeGreaterThan(0);
    expect(boutons().every(b => b.disabled)).toBe(true);
    fin();
    await vi.waitFor(() => expect(v.querySelector('.section-sauvegarde').textContent).toContain('Restauration terminée'));
    expect(v.querySelector('.section-sauvegarde input[type="file"]').disabled).toBe(false);
    expect(boutons().every(b => !b.disabled)).toBe(true);
  });

  it('reste disponible tant qu’aucun profil n’est importé', () => {
    const v = vueProfil({ profil: null }, actionsSauvegarde(), { downloads: true });
    expect(v.querySelector('.section-sauvegarde')).not.toBeNull();
  });

  it('signale un fichier illisible', async () => {
    const a = actionsSauvegarde();
    const v = vueProfil({ profil: fictif }, a, { downloads: true });
    const input = v.querySelector('.section-sauvegarde input[type="file"]');
    Object.defineProperty(input, 'files', { configurable: true, value: [{ text: async () => { throw new Error('x'); } }] });
    input.dispatchEvent(new Event('change'));
    await vi.waitFor(() => expect(v.querySelector('.section-sauvegarde').textContent).toContain('Ce fichier ne peut pas être lu.'));
    expect(a.analyserRestauration).not.toHaveBeenCalled();
  });
});
