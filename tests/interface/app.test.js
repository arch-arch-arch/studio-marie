// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFausseBase } from '../aides/fausseBase.js';
import { demarrer } from '../../src/interface/app.js';

const horloge = () => '2026-09-28T08:00:00.000Z';

describe('demarrer', () => {
  it('affiche un message clair quand la base est indisponible', async () => {
    const racine = document.createElement('div');
    expect(await demarrer(racine, { use: async () => null }, { horloge })).toBeNull();
    expect(racine.textContent).toContain('La base du studio n’est pas accessible depuis cette vue.');
  });

  it('affiche aussi le message quand window.claude est absent', async () => {
    const racine = document.createElement('div');
    await demarrer(racine, undefined, { horloge });
    expect(racine.textContent).toContain('pas accessible');
  });

  it('ouvre l’onglet Profil tant qu’aucun profil n’est importé, puis la semaine', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    expect(app.etat.lire().vue).toBe('profil');
    expect(racine.querySelector('#profil-json')).not.toBeNull();
    await app.actions.importerProfil(JSON.stringify(fictif));
    expect(app.etat.lire().vue).toBe('semaine');
    expect(racine.querySelector('.barre .titre').textContent).toBe('Studio');
  });

  it('affiche l’erreur de base même avant le premier instantané du profil', async () => {
    const reelle = creerFausseBase();
    const db = {
      ...reelle,
      doc(chemin) {
        if (chemin === 'profil/courant') {
          return { ...reelle.doc(chemin), onSnapshot: (suivant, erreur) => { erreur({ code: 'revoked' }); return () => {}; } };
        }
        return reelle.doc(chemin);
      },
    };
    const racine = document.createElement('div');
    await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    expect(racine.textContent).toContain('L’accès au studio a été retiré pour cette vue.');
    expect(racine.textContent).not.toContain('Chargement du studio…');
  });

  it('affiche un message clair et l’indicateur en échec quand la base est pleine', async () => {
    const reelle = creerFausseBase();
    let appel = 0;
    const db = {
      ...reelle,
      doc(chemin) {
        const d = reelle.doc(chemin);
        if (!chemin.startsWith('fiches/')) return d;
        return {
          ...d,
          async set(corps) {
            appel += 1;
            if (appel === 2) throw { code: 'quota_exceeded' };
            return d.set(corps);
          },
        };
      },
    };
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    const f = await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    app.actions.modifierFiche(f.id, { accroche: 'x' });
    await app.actions.fermerPanneau();
    expect(racine.textContent).toContain('La base du studio est pleine');
    expect(racine.querySelector('.sauvegarde').className).toContain('sauvegarde-erreur');
    await new Promise(r => setTimeout(r, 650)); // laisse la nouvelle tentative automatique se terminer proprement
  });

  it('empêche un fichier lâché hors de la zone prévue de quitter la page', async () => {
    const db = creerFausseBase();
    const racine = document.createElement('div');
    await demarrer(racine, { use: async nom => (nom === 'db' ? db : null) }, { horloge });
    const evt = new Event('drop', { cancelable: true });
    Object.defineProperty(evt, 'dataTransfer', { value: { types: ['Files'] } });
    document.dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });

  it('transmet la capacité sample au contrôleur', async () => {
    const db = creerFausseBase();
    const sample = Object.assign(async () => ({}), { json: vi.fn(async () => ({})), limits: async () => ({}) });
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'sample' ? sample : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    await app.actions.evaluerFiche(app.etat.lire().ficheOuverte);
    expect(sample.json).toHaveBeenCalledTimes(1);
  });

  it('réimporter le profil repasse en brouillon les fiches validées que les nouvelles règles bloquent', async () => {
    const REPONSE = {
      notes: { accroche: 8, voix: 7, mecanique: 6 },
      phrases: { accroche: 'A.', voix: 'V.', mecanique: 'M.' },
      conformite: { etat: 'vert', causes: [] },
      captions: [{ role: 'engagement', texte: 'Variante A' }, { role: 'deadpan', texte: 'Variante B' }],
      accroches: ['Acc 1', 'Acc 2'],
      hashtags: ['nuit', 'socio'],
      recommandations: ['R1', 'R2', 'R3'],
    };
    const db = creerFausseBase();
    const sample = Object.assign(vi.fn(), { limits: async () => ({}), json: vi.fn(async () => REPONSE) });
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'sample' ? sample : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    const f = await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    app.actions.modifierFiche(f.id, {
      accroche: 'Tu relis ce message.', caption: 'Une ligne. Dis-moi en commentaire.',
      hashtags: ['nuit', 'socio', 'humour'], visuel: 'a1', visuel_type: 'image',
    });
    await app.actions.fermerPanneau();
    await app.actions.evaluerFiche(f.id);
    expect(await app.actions.changerStatut(f.id, 'valide')).toEqual({ ok: true });

    const bloque = { ...fictif, regles_studio: { ...fictif.regles_studio, mots_a_eviter: [...fictif.regles_studio.mots_a_eviter, 'ligne'] } };
    await app.actions.importerProfil(JSON.stringify(bloque));

    expect(app.etat.lire().fiches.find(x => x.id === f.id).statut).toBe('brouillon');
    await vi.waitFor(() => expect(app.etat.lire().erreur).toBe('1 fiche(s) repassée(s) en Brouillon : le profil actuel les bloque.'));
  });

  it('propose « Évaluer » dans la fiche quand la capacité sample existe', async () => {
    const db = creerFausseBase();
    const sample = Object.assign(async () => ({}), { json: async () => ({}), limits: async () => ({}) });
    const racine = document.createElement('div');
    const app = await demarrer(racine, { use: async nom => (nom === 'db' ? db : nom === 'sample' ? sample : null) }, { horloge });
    await app.actions.importerProfil(JSON.stringify(fictif));
    await app.actions.creerFiche({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
    expect([...racine.querySelectorAll('button')].some(b => b.textContent === 'Évaluer')).toBe(true);
  });
});
