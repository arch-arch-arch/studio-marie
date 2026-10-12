import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { creerFauxSupabase } from '../aides/fauxSupabase.js';
import { construireExport, COLLECTIONS_EXPORT } from '../../src/logique/sauvegarde.js';
import { TAILLE_MAX } from '../../src/socle/visuels-supabase.js';
import { migrer, associerVisuels, lireExport, referencesVisuels, lireArguments } from '../../scripts/migrer.mjs';

const vide = () => Object.fromEntries(COLLECTIONS_EXPORT.map(c => [c, []]));
const exportAvec = docs => construireExport({ ...vide(), ...docs }, '2026-10-01T08:00:00.000Z');
const visuel = id => ({ id, type: 'image/png', contenu: new Blob(['x'], { type: 'image/png' }) });

describe('migrer', () => {
  it('écrit les documents et les visuels sous leurs identifiants d’origine', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({
      exportJson: exportAvec({ profil: [{ id: 'courant', data: { ...fictif, version: 2 } }], fiches: [{ id: 'f1', data: { visuel: 'a1', accroche: 'x' } }, { id: 'f2', data: { visuel: null } }] }),
      visuels: [visuel('a1')], supabase, journal: () => {},
    });
    expect(r).toEqual({ ok: true, documents: 3, visuels: 1 });
    expect(supabase._lignes.get('fiches/f1').data).toEqual({ visuel: 'a1', accroche: 'x' });
    expect(supabase._lignes.get('profil/courant').data.version).toBe(2);
    expect(supabase._fichiers.has('visuels/a1')).toBe(true);
  });
  it('s’arrête avant d’écrire si l’export est invalide', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({ exportJson: exportAvec({ profil: [{ id: 'courant', data: {} }] }), visuels: [], supabase, journal: () => {} });
    expect(r.ok).toBe(false);
    expect(r.erreurs[0]).toMatch(/^profil\/courant : /);
    expect(supabase._lignes.size).toBe(0);
  });
  it('s’arrête avant d’écrire si un visuel référencé manque', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({ exportJson: exportAvec({ fiches: [{ id: 'f1', data: { visuel: 'a1' } }, { id: 'f2', data: { visuel: 'a2' } }] }), visuels: [visuel('a1')], supabase, journal: () => {} });
    expect(r).toEqual({ ok: false, erreurs: ['Visuel manquant : a2 (fiche f2).'] });
    expect(supabase._lignes.size).toBe(0);
    expect(supabase._fichiers.size).toBe(0);
  });
  it('signale une écriture en échec', async () => {
    const supabase = creerFauxSupabase();
    supabase._panne({ message: 'boom', status: 500 });
    const r = await migrer({ exportJson: exportAvec({ fiches: [{ id: 'f1', data: {} }] }), visuels: [], supabase, journal: () => {} });
    expect(r.ok).toBe(false);
    expect(r.erreurs[0]).toContain('boom');
  });
  it('refuse, avant toute écriture, un visuel référencé dont le type n’est pas accepté', async () => {
    const exportJson = exportAvec({ fiches: [{ id: 'f1', data: { visuel: 'a1' } }, { id: 'f2', data: { visuel: 'a2' } }] });
    for (const [contenu, attendu] of [
      [new Blob(['x']), 'Visuel a2 : type non accepté ().'],
      [new Blob(['x'], { type: 'application/pdf' }), 'Visuel a2 : type non accepté (application/pdf).'],
      ['pas un blob', 'Visuel a2 : type non accepté ().'],
    ]) {
      const supabase = creerFauxSupabase();
      const r = await migrer({ exportJson, visuels: [visuel('a1'), { id: 'a2', type: 'image/png', contenu }], supabase, journal: () => {} });
      expect(r).toEqual({ ok: false, erreurs: [attendu] });
      expect(supabase._lignes.size).toBe(0);
      expect(supabase._fichiers.size).toBe(0);
    }
  });
  it('en simulation, valide et compte sans rien écrire', async () => {
    const supabase = creerFauxSupabase();
    const lignes = [];
    const r = await migrer({
      exportJson: exportAvec({ fiches: [{ id: 'f1', data: { visuel: 'a1' } }, { id: 'f2', data: {} }] }),
      visuels: [visuel('a1')], supabase, journal: m => lignes.push(m), simuler: true,
    });
    expect(r).toEqual({ ok: true, documents: 2, visuels: 1, simulation: true, dejaPresents: 0 });
    expect(supabase._lignes.size).toBe(0);
    expect(supabase._fichiers.size).toBe(0);
    expect(lignes).toContain('fiches : 2');
  });
  it('la simulation signale aussi un export invalide', async () => {
    const r = await migrer({ exportJson: { format: 'autre' }, visuels: [], supabase: creerFauxSupabase(), journal: () => {}, simuler: true });
    expect(r.ok).toBe(false);
  });
  it('est réexécutable : deux migrations donnent le même état', async () => {
    const supabase = creerFauxSupabase();
    const exportJson = exportAvec({ fiches: [{ id: 'f1', data: { visuel: 'a1' } }, { id: 'f2', data: {} }] });
    const lancer = (ecraser) => migrer({ exportJson, visuels: [visuel('a1')], supabase, journal: () => {}, ecraser, maintenant: '2026-10-01T09:00:00.000Z' });
    const r1 = await lancer(false);
    const etat = JSON.stringify([...supabase._lignes]);
    const r2 = await lancer(true);
    expect(r1).toEqual({ ok: true, documents: 2, visuels: 1 });
    expect(r2).toEqual(r1);
    expect(JSON.stringify([...supabase._lignes])).toBe(etat);
    expect(supabase._lignes.size).toBe(2);
    expect(supabase._fichiers.size).toBe(1);
  });
  it('ne migre pas le marqueur de veille', async () => {
    const supabase = creerFauxSupabase();
    const lignes = [];
    const r = await migrer({
      exportJson: exportAvec({ config: [{ id: 'veille_en_cours', data: { debut: 'x' } }, { id: 'reglages', data: { a: 1 } }] }),
      visuels: [], supabase, journal: m => lignes.push(m),
    });
    expect(r).toEqual({ ok: true, documents: 1, visuels: 0 });
    expect(supabase._lignes.has('config/veille_en_cours')).toBe(false);
    expect(supabase._lignes.has('config/reglages')).toBe(true);
    expect(lignes).toContain('Marqueur de veille ignoré.');
  });
  it('utilise un seul horodatage maj_le pour toute la migration', async () => {
    const supabase = creerFauxSupabase();
    await migrer({ exportJson: exportAvec({ fiches: [{ id: 'f1', data: {} }], bulletins: [{ id: 'b1', data: {} }] }), visuels: [], supabase, journal: () => {}, maintenant: '2026-10-01T09:00:00.000Z' });
    expect([...supabase._lignes.values()].map(l => l.maj_le)).toEqual(['2026-10-01T09:00:00.000Z', '2026-10-01T09:00:00.000Z']);
  });
});

describe('associerVisuels', () => {
  it('garde le nom complet s’il est référencé', () => {
    expect(associerVisuels(['a1.png'], new Set(['a1.png']))).toEqual({ associes: [{ id: 'a1.png', nom: 'a1.png', type: 'image/png' }], ignores: [], extensionsInconnues: [] });
  });
  it('retire la dernière extension si seul le nom sans extension est référencé', () => {
    expect(associerVisuels(['a1.JPG', 'b.v2.webp'], new Set(['a1', 'b.v2']))).toEqual({
      associes: [{ id: 'a1', nom: 'a1.JPG', type: 'image/jpeg' }, { id: 'b.v2', nom: 'b.v2.webp', type: 'image/webp' }],
      ignores: [], extensionsInconnues: [],
    });
  });
  it('distingue un fichier non référencé d’un fichier d’extension inconnue', () => {
    expect(associerVisuels(['z.png', 'a1.xyz', 'a1'], new Set(['a1']))).toEqual({ associes: [], ignores: ['z.png'], extensionsInconnues: ['a1.xyz', 'a1'] });
  });
  it('refuse deux fichiers qui donnent le même identifiant', () => {
    expect(() => associerVisuels(['a1.png', 'a1.jpg'], new Set(['a1']))).toThrow(/a1/);
  });
});

const ligne = (collection, id) => ({ collection, id, data: { ancien: true }, maj_le: '2026-09-30T00:00:00.000Z' });
const poser = (supabase, ...lignes) => lignes.forEach(l => supabase._lignes.set(`${l.collection}/${l.id}`, l));
const exportFiche = exportAvec({ fiches: [{ id: 'f1', data: { visuel: 'a1' } }] });
const lectureSeule = faux => t => {
  const q = faux.from(t);
  return { select: (...a) => q.select(...a), order: (...a) => q.order(...a), range: (...a) => q.range(...a), then: (ok, ko) => q.then(ok, ko) };
};

describe('migrer : lecture de la cible', () => {
  it('migre normalement si la cible est vide', async () => {
    const supabase = creerFauxSupabase();
    const journal = [];
    const r = await migrer({ exportJson: exportFiche, visuels: [visuel('a1')], supabase, journal: m => journal.push(m) });
    expect(r).toEqual({ ok: true, documents: 1, visuels: 1 });
    expect(journal).toContain('Déjà présents dans la cible : 0 document(s), dont 0 seraient remplacés.');
  });
  it('migre normalement si la cible ne contient que d’autres documents', async () => {
    const supabase = creerFauxSupabase();
    poser(supabase, ligne('fiches', 'autre'), ligne('bulletins', 'f1'));
    const journal = [];
    const r = await migrer({ exportJson: exportFiche, visuels: [visuel('a1')], supabase, journal: m => journal.push(m) });
    expect(r.ok).toBe(true);
    expect(journal).toContain('Déjà présents dans la cible : 2 document(s), dont 0 seraient remplacés.');
    expect(supabase._lignes.size).toBe(3);
  });
  it('refuse sans écrire si la cible contient déjà un document de l’export', async () => {
    const supabase = creerFauxSupabase();
    poser(supabase, ligne('fiches', 'f1'));
    const journal = [];
    const r = await migrer({ exportJson: exportFiche, visuels: [visuel('a1')], supabase, journal: m => journal.push(m) });
    expect(r).toEqual({ ok: false, erreurs: ['La cible contient déjà 1 document(s) de cet export. Rien n’a été écrit. Relance avec --ecraser pour les remplacer.'] });
    expect(supabase._lignes.get('fiches/f1').data).toEqual({ ancien: true });
    expect(supabase._lignes.size).toBe(1);
    expect(supabase._fichiers.size).toBe(0);
    expect(journal).toContain('Déjà présents dans la cible : 1 document(s), dont 1 seraient remplacés.');
  });
  it('remplace avec ecraser: true', async () => {
    const supabase = creerFauxSupabase();
    poser(supabase, ligne('fiches', 'f1'));
    const r = await migrer({ exportJson: exportFiche, visuels: [visuel('a1')], supabase, journal: () => {}, ecraser: true });
    expect(r).toEqual({ ok: true, documents: 1, visuels: 1 });
    expect(supabase._lignes.get('fiches/f1').data).toEqual({ visuel: 'a1' });
  });
  it('lit la cible par pages de 1000', async () => {
    const supabase = creerFauxSupabase();
    for (let i = 0; i <= 1000; i++) poser(supabase, ligne('fiches', `d${String(i).padStart(4, '0')}`));
    const r = await migrer({ exportJson: exportAvec({ fiches: [{ id: 'd1000', data: {} }] }), visuels: [], supabase, journal: () => {} });
    expect(r.erreurs[0]).toMatch(/^La cible contient déjà 1 document/);
    expect(supabase._lectures).toBe(3);
  });
  it('lit la cible en entier quand le plafond de lignes du projet est sous 1000', async () => {
    const supabase = creerFauxSupabase();
    supabase._plafond(10);
    for (let i = 0; i < 25; i++) poser(supabase, ligne('fiches', `d${String(i).padStart(4, '0')}`));
    const journal = [];
    const r = await migrer({ exportJson: exportAvec({ fiches: [{ id: 'd0024', data: {} }] }), visuels: [], supabase, journal: m => journal.push(m) });
    expect(r.erreurs[0]).toMatch(/^La cible contient déjà 1 document/);
    expect(journal).toContain('Déjà présents dans la cible : 25 document(s), dont 1 seraient remplacés.');
    expect(supabase._lectures).toBe(4);
  });
  it('s’arrête avant d’écrire si la lecture de la cible échoue', async () => {
    const faux = creerFauxSupabase();
    const q = { select: () => q, order: () => q, range: () => q, then: ok => Promise.resolve({ data: null, error: { message: 'illisible' } }).then(ok) };
    const supabase = { ...faux, from: () => q };
    const r = await migrer({ exportJson: exportFiche, visuels: [visuel('a1')], supabase, journal: () => {} });
    expect(r).toEqual({ ok: false, erreurs: ['Lecture de la cible impossible : illisible'] });
    expect(faux._fichiers.size).toBe(0);
  });
  it('simulation avec client : lit la cible et renvoie dejaPresents, sans refuser ni écrire', async () => {
    const faux = creerFauxSupabase();
    poser(faux, ligne('fiches', 'f1'));
    const interdit = () => { throw new Error('écriture interdite en simulation'); };
    const supabase = { ...faux, from: lectureSeule(faux), storage: { from: () => ({ upload: interdit }) } };
    const r = await migrer({ exportJson: exportFiche, visuels: [visuel('a1')], supabase, journal: () => {}, simuler: true });
    expect(r).toEqual({ ok: true, documents: 1, visuels: 1, simulation: true, dejaPresents: 1 });
    expect(faux._fichiers.size).toBe(0);
  });
  it('simulation sans client : dejaPresents null et journal', async () => {
    const journal = [];
    const r = await migrer({ exportJson: exportFiche, visuels: [visuel('a1')], supabase: null, journal: m => journal.push(m), simuler: true });
    expect(r).toEqual({ ok: true, documents: 1, visuels: 1, simulation: true, dejaPresents: null });
    expect(journal).toContain('Cible non consultée.');
  });
});

describe('migrer : contrôles préalables', () => {
  it('refuse un visuel de plus de 20 Mo', async () => {
    const supabase = creerFauxSupabase();
    const gros = { id: 'a1', type: 'image/png', contenu: new Blob([new Uint8Array(TAILLE_MAX + 1)], { type: 'image/png' }) };
    const r = await migrer({ exportJson: exportFiche, visuels: [gros], supabase, journal: () => {} });
    expect(r).toEqual({ ok: false, erreurs: ['Visuel a1 : plus de 20 Mo.'] });
    expect(supabase._fichiers.size).toBe(0);
  });
  it('journalise les collections inconnues ignorées', async () => {
    const e = exportAvec({});
    e.collections.mystere = [{ id: 'x', data: {} }];
    const journal = [];
    const r = await migrer({ exportJson: e, visuels: [], supabase: creerFauxSupabase(), journal: m => journal.push(m) });
    expect(r.ok).toBe(true);
    expect(journal).toContain('Collection inconnue ignorée : mystere');
  });
  it('refuse deux documents de même identifiant dans une collection', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({ exportJson: exportAvec({ fiches: [{ id: 'f1', data: {} }, { id: 'f1', data: {} }] }), visuels: [], supabase, journal: () => {} });
    expect(r).toEqual({ ok: false, erreurs: ['fiches/f1 : identifiant en double.'] });
    expect(supabase._lignes.size).toBe(0);
  });
  it('signale une extension non reconnue plutôt qu’un visuel manquant', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({ exportJson: exportFiche, visuels: [], extensionsInconnues: ['a1.xyz'], supabase, journal: () => {} });
    expect(r).toEqual({ ok: false, erreurs: ['Visuel a1 : extension non reconnue (a1.xyz).'] });
  });
  it('n’envoie pas les visuels non référencés', async () => {
    const supabase = creerFauxSupabase();
    const journal = [];
    const r = await migrer({ exportJson: exportFiche, visuels: [visuel('a1'), visuel('zz')], supabase, journal: m => journal.push(m) });
    expect(r).toEqual({ ok: true, documents: 1, visuels: 1 });
    expect([...supabase._fichiers.keys()]).toEqual(['visuels/a1']);
    expect(journal).toContain('Visuel non référencé, ignoré : zz');
  });
  it('refuse deux visuels de même id avant d’écrire', async () => {
    const supabase = creerFauxSupabase();
    const r = await migrer({ exportJson: exportFiche, visuels: [visuel('a1'), visuel('a1')], supabase, journal: () => {} });
    expect(r).toEqual({ ok: false, erreurs: ['Visuel a1 : fourni en double.'] });
    expect(supabase._fichiers.size).toBe(0);
  });
  it('avertit si l’export ne contient pas de profil', async () => {
    const journal = [];
    const r = await migrer({ exportJson: exportFiche, visuels: [visuel('a1')], supabase: creerFauxSupabase(), journal: m => journal.push(m) });
    expect(r.ok).toBe(true);
    expect(journal).toContain('Attention : l’export ne contient pas de profil.');
  });
});

describe('migrer : échec en cours d’écriture', () => {
  const enveloppe = (faux, { echecUpsert = 0, echecUpload = 0 }) => {
    let upserts = 0;
    let uploads = 0;
    return {
      ...faux,
      from: t => ({ ...lectureSeule(faux)(t), upsert: l => (++upserts === echecUpsert ? Promise.resolve({ data: null, error: { message: 'boom' } }) : faux.from(t).upsert(l)) }),
      storage: { from: e => ({ upload: (...a) => (++uploads === echecUpload ? Promise.resolve({ data: null, error: { message: 'boom' } }) : faux.storage.from(e).upload(...a)) }) },
    };
  };
  it('indique ce qui est écrit quand un document échoue', async () => {
    const faux = creerFauxSupabase();
    const exportJson = exportAvec({ profil: [{ id: 'courant', data: { ...fictif, version: 2 } }], fiches: [{ id: 'f1', data: { visuel: 'a1' } }] });
    const r = await migrer({ exportJson, visuels: [visuel('a1')], supabase: enveloppe(faux, { echecUpsert: 2 }), journal: () => {} });
    expect(r).toEqual({ ok: false, erreurs: ['fiches : boom', 'Écrit avant l’échec : 1 visuel(s), 1 document(s). Relance la même commande avec --ecraser : elle est réexécutable.'] });
  });
  it('indique ce qui est écrit quand un visuel échoue', async () => {
    const faux = creerFauxSupabase();
    const exportJson = exportAvec({ fiches: [{ id: 'f1', data: { visuel: 'a1' } }, { id: 'f2', data: { visuel: 'a2' } }] });
    const r = await migrer({ exportJson, visuels: [visuel('a1'), visuel('a2')], supabase: enveloppe(faux, { echecUpload: 2 }), journal: () => {} });
    expect(r).toEqual({ ok: false, erreurs: ['Visuel a2 : boom', 'Écrit avant l’échec : 1 visuel(s), 0 document(s). Relance la même commande avec --ecraser : elle est réexécutable.'] });
    expect(faux._lignes.size).toBe(0);
  });
  it('travaille par lots de 50', async () => {
    const faux = creerFauxSupabase();
    const fiches = Array.from({ length: 120 }, (_, i) => ({ id: `f${i}`, data: {} }));
    const r = await migrer({ exportJson: exportAvec({ fiches }), visuels: [], supabase: enveloppe(faux, { echecUpsert: 3 }), journal: () => {} });
    expect(r.erreurs[1]).toContain('0 visuel(s), 100 document(s)');
    expect(faux._lignes.size).toBe(100);
  });
});

describe('lireArguments', () => {
  it('lit les options connues', () => {
    expect(lireArguments(['--export', 'a.json', '--visuels', 'dossier', '--simuler', '--ecraser'])).toEqual({ ok: true, options: { export: 'a.json', visuels: 'dossier', simuler: true, ecraser: true } });
    expect(lireArguments(['--export', 'a.json'])).toEqual({ ok: true, options: { export: 'a.json', visuels: null, simuler: false, ecraser: false } });
    expect(lireArguments([])).toEqual({ ok: true, options: { export: null, visuels: null, simuler: false, ecraser: false } });
  });
  it('refuse une option inconnue, même proche de --simuler', () => {
    expect(lireArguments(['--export', 'a.json', '--simuller'])).toEqual({ ok: false, erreur: 'Option inconnue : --simuller.' });
    expect(lireArguments(['--force'])).toEqual({ ok: false, erreur: 'Option inconnue : --force.' });
  });
  it('refuse une valeur manquante ou qui ressemble à une option', () => {
    expect(lireArguments(['--export'])).toEqual({ ok: false, erreur: 'Valeur manquante pour --export.' });
    expect(lireArguments(['--visuels', '--simuler'])).toEqual({ ok: false, erreur: 'Valeur manquante pour --visuels.' });
  });
  it('refuse un argument positionnel inattendu', () => {
    expect(lireArguments(['--export', 'a.json', 'b.json'])).toEqual({ ok: false, erreur: 'Argument inattendu : b.json.' });
  });
});

describe('lireExport et referencesVisuels', () => {
  it('lit un JSON, avec ou sans BOM', () => {
    expect(lireExport('{"a":1}')).toEqual({ a: 1 });
    expect(lireExport('\uFEFF{"a":1}')).toEqual({ a: 1 });
  });
  it('donne un message fixe pour un JSON illisible, sans fragment du contenu', () => {
    expect(() => lireExport('{"secret": oups')).toThrow('Le fichier d’export n’est pas un JSON lisible.');
    try { lireExport('{"secret": oups'); } catch (e) { expect(e.message).not.toContain('secret'); }
  });
  it('ne plante pas sur un export mal formé', () => {
    expect(referencesVisuels({ collections: { fiches: 'x' } })).toEqual(new Set());
    expect(referencesVisuels(null)).toEqual(new Set());
    expect(referencesVisuels({ collections: { fiches: [{ data: { visuel: 'a1' } }, null, { data: {} }] } })).toEqual(new Set(['a1']));
  });
});
