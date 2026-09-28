// @vitest-environment happy-dom
import { describe, it, expect } from 'vitest';
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
});
