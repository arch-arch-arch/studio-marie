import { describe, it, expect } from 'vitest';
import { COLLECTIONS_EXPORT, construireExport, validerExport, resumeRestauration, nomFichierExport } from '../../src/logique/sauvegarde.js';

const M = '2026-09-29T22:30:00.000Z';
const vide = () => Object.fromEntries(COLLECTIONS_EXPORT.map(c => [c, []]));

describe('export', () => {
  it('liste les collections du studio', () => {
    expect(COLLECTIONS_EXPORT).toEqual(['profil', 'profil_archives', 'fiches', 'bulletins', 'stats_contenu', 'releves_compte', 'reference', 'reference_resultats', 'config']);
  });
  it('construit le fichier', () => {
    const e = construireExport({ ...vide(), fiches: [{ id: 'f1', data: { accroche: 'x' } }] }, M);
    expect(e).toEqual({
      format: 'studio-contenu-export', version: 1, exporte_le: M,
      note: 'Les visuels ne sont pas inclus : seuls leurs identifiants le sont.',
      collections: { ...vide(), fiches: [{ id: 'f1', data: { accroche: 'x' } }] },
    });
  });
  it('nomme le fichier selon le jour local', () => {
    expect(nomFichierExport(M, 'Europe/Paris')).toBe('studio-contenu-2026-09-30.json');
    expect(nomFichierExport(M, 'UTC')).toBe('studio-contenu-2026-09-29.json');
  });
});

describe('validerExport', () => {
  const bon = () => construireExport({ ...vide(), fiches: [{ id: 'f1', data: { a: 1 } }, { id: 'f2', data: {} }], profil: [{ id: 'courant', data: { version: 2 } }] }, M);
  it('accepte un export valide, compte et ignore les collections inconnues', () => {
    const e = bon();
    e.collections.inconnue = [{ id: 'x', data: {} }];
    const v = validerExport(e);
    expect(v.ok).toBe(true);
    expect(v.total).toBe(3);
    expect(v.ignorees).toEqual(['inconnue']);
    expect(v.collections.fiches).toHaveLength(2);
    expect(resumeRestauration(v)).toBe('À restaurer : profil : 1, fiches : 2 (total 3 documents). Les documents de même identifiant seront remplacés ; rien ne sera supprimé. Collections inconnues ignorées : inconnue.');
  });
  it('refuse les fichiers d’un autre format ou d’une autre version', () => {
    expect(validerExport(null).erreurs).toEqual(['Ce fichier n’est pas un export du studio.']);
    expect(validerExport({ format: 'autre' }).erreurs).toEqual(['Ce fichier n’est pas un export du studio.']);
    expect(validerExport({ ...bon(), version: 2 }).erreurs).toEqual(['Version d’export non prise en charge : 2.']);
    expect(validerExport({ ...bon(), collections: [] }).erreurs).toEqual(['Le fichier ne contient pas de collections.']);
  });
  it('refuse les documents mal formés', () => {
    const e = bon();
    e.collections.fiches = [{ id: '', data: {} }, { id: 'a/b', data: {} }, { id: 'ok', data: [] }, 'x'];
    expect(validerExport(e).erreurs).toEqual([
      'fiches, document 1 : identifiant invalide.', 'fiches, document 2 : identifiant invalide.',
      'fiches, document 3 : contenu invalide.', 'fiches, document 4 : contenu invalide.',
    ]);
    const e2 = bon();
    e2.collections.bulletins = 'x';
    expect(validerExport(e2).erreurs).toEqual(['bulletins : liste de documents attendue.']);
  });
  it('accepte une collection absente comme vide', () => {
    const e = bon();
    delete e.collections.config;
    expect(validerExport(e).ok).toBe(true);
  });
});
