import { describe, it, expect } from 'vitest';
import { lireRetour, validerRetour, MESSAGE_SANS_BLOC, MESSAGE_COUPE } from '../../src/logique/retour-dossier.js';

const jugement = (id, plus = {}) => ({
  id,
  notes: { accroche: 7, voix: 8, mecanique: 6 },
  phrases: { accroche: 'Bonne.', voix: 'Juste.', mecanique: 'Claire.' },
  conformite: { etat: 'vert', causes: [] },
  captions: [{ role: 'engagement', texte: 'A ?' }, { role: 'deadpan', texte: 'B.' }],
  accroches: ['Une', 'Deux'],
  hashtags: ['nuit'],
  recommandations: [{ texte: 'r1', pourquoi: 'p1' }, { texte: 'r2', pourquoi: 'p2' }, { texte: 'r3', pourquoi: 'p3' }],
  ...plus,
});
const bloc = (objet, langue = 'json') => `\`\`\`${langue}\n${JSON.stringify(objet, null, 2)}\n\`\`\``;
const objet = { dossier: 'D-abc123', fiches: [jugement('F01'), jugement('F02')], periode: { avis: 'Bien.', points_forts: ['a'], risques: ['b'], ordre_conseille: ['F02', 'F01', 'F09'] } };
const analyse = { fiches: [{ ref: 'F01', id: 'a', empreinte: 'e1' }, { ref: 'F02', id: 'b', empreinte: 'e2' }] };

describe('lireRetour', () => {
  it('lit le dernier bloc de code, avec ou sans mention json', () => {
    const texte = `Voici mon analyse.\n\n\`\`\`json\n{"exemple": true}\n\`\`\`\n\nBloc à coller dans le studio :\n${bloc(objet)}`;
    expect(lireRetour(texte)).toMatchObject({ ok: true, dossier: 'D-abc123' });
    expect(lireRetour(`Analyse…\n${bloc(objet, '')}`).ok).toBe(true);
  });
  it('lit un objet sans bloc de code, malgré un préambule', () => {
    const r = lireRetour(`Voici : ${JSON.stringify(objet)} Voilà.`);
    expect(r.ok).toBe(true);
    expect(r.fiches).toHaveLength(2);
  });
  it('retire les marqueurs de citation des textes', () => {
    const sale = { ...objet, periode: { ...objet.periode, avis: 'Bien. Source : :codex-file-citation{path="x.pdf" purpose="source"}. Fin 【4†source】 [oaicite:2] citeturn0file0.' } };
    expect(lireRetour(bloc(sale)).periode.avis).toBe('Bien. Source : . Fin .');
  });
  it('explique un retour vide, sans bloc ou coupé', () => {
    expect(lireRetour('')).toEqual({ ok: false, raison: MESSAGE_SANS_BLOC });
    expect(lireRetour('Juste du texte.')).toEqual({ ok: false, raison: MESSAGE_SANS_BLOC });
    expect(lireRetour(`\`\`\`json\n${JSON.stringify(objet).slice(0, 200)}`)).toEqual({ ok: false, raison: MESSAGE_COUPE });
    expect(lireRetour(bloc({ fiches: [] }))).toEqual({ ok: false, raison: MESSAGE_SANS_BLOC });
    expect(lireRetour(bloc({ dossier: 'D-abc123', fiches: 'non' }))).toEqual({ ok: false, raison: MESSAGE_SANS_BLOC });
  });
  it('fixe les messages', () => {
    expect(MESSAGE_SANS_BLOC).toBe('Je ne trouve pas le bloc à coller dans cette réponse. Copie toute la réponse de l’assistant, puis recolle-la.');
    expect(MESSAGE_COUPE).toBe(`${MESSAGE_SANS_BLOC} Si la réponse a été coupée, demande à l’assistant de redonner seulement le bloc.`);
  });
  it('lit le dernier de deux blocs portant dossier et fiches', () => {
    const premier = { dossier: 'D-ancien', fiches: [jugement('F01')] };
    const r = lireRetour(`Essai :\n${bloc(premier)}\nVersion finale :\n${bloc(objet)}`);
    expect(r).toMatchObject({ ok: true, dossier: 'D-abc123' });
    expect(r.fiches).toHaveLength(2);
  });
  it('tolère espaces, lignes vides et mention JSON en majuscules', () => {
    const json = JSON.stringify(objet);
    expect(lireRetour(`Texte\n\`\`\`JSON\n\n\n   ${json}   \n\n\`\`\`\nFin`).ok).toBe(true);
    expect(lireRetour(`\`\`\`json  \n\n  ${json}\n\n  \`\`\``).ok).toBe(true);
  });
  it('lit des fins de ligne Windows', () => {
    const texte = `Analyse.\n\n${bloc(objet)}\n`.replace(/\n/g, '\r\n');
    expect(texte).toContain('\r\n');
    expect(lireRetour(texte)).toMatchObject({ ok: true, dossier: 'D-abc123' });
  });
  it('ne lève pas avec des guillemets courbes : le retour est illisible', () => {
    const courbe = JSON.stringify(objet, null, 2).replace(/"([^"]*)"/g, '“$1”');
    const sans = lireRetour(`\`\`\`json\n${courbe}\n\`\`\``);
    expect(sans.ok).toBe(false);
    expect([MESSAGE_SANS_BLOC, MESSAGE_COUPE]).toContain(sans.raison);
    const partiel = lireRetour('{“dossier”: “D-abc123”, “fiches”: []}');
    expect(partiel.ok).toBe(false);
    expect([MESSAGE_SANS_BLOC, MESSAGE_COUPE]).toContain(partiel.raison);
  });
  it('ne lève jamais, quelle que soit l’entrée', () => {
    for (const x of [null, undefined, 42, {}, [], true, '{', '}{', '```', '```json\n```']) {
      expect(() => lireRetour(x)).not.toThrow();
      expect(lireRetour(x).ok).toBe(false);
    }
  });
  it('reste rapide sur un texte très long', () => {
    const debut = Date.now();
    const long = `${'Un préambule assez bavard, avec des « mots » et des {accolades. '.repeat(3500)}\n${bloc(objet)}`;
    expect(long.length).toBeGreaterThan(200000);
    expect(lireRetour(long).ok).toBe(true);
    expect(lireRetour('a '.repeat(100000)).ok).toBe(false);
    expect(lireRetour('```json\n'.repeat(25000)).ok).toBe(false);
    expect(lireRetour(' '.repeat(200000) + '```json').ok).toBe(false);
    expect(Date.now() - debut).toBeLessThan(3000);
  });
});

describe('validerRetour', () => {
  it('relie chaque fiche valide à son identifiant', () => {
    const r = validerRetour(lireRetour(bloc(objet)), analyse);
    expect(r.valides.map(v => [v.ref, v.id, v.empreinte])).toEqual([['F01', 'a', 'e1'], ['F02', 'b', 'e2']]);
    expect(r.valides[0].jugement.recommandations[0]).toEqual({ texte: 'r1', pourquoi: 'p1' });
    expect(r.ecartees).toEqual([]);
    expect(r.periode).toEqual({ avis: 'Bien.', points_forts: ['a'], risques: ['b'], ordre_conseille: ['F02', 'F01'] });
  });
  it('écarte les fiches invalides, inconnues ou en double et garde les autres', () => {
    const mauvais = { ...objet, fiches: [jugement('F01'), jugement('F02', { captions: [{ role: 'envoi', texte: 'x' }, { role: 'deadpan', texte: 'y' }] }), jugement('F07'), jugement('F01'), { notes: {} }] };
    const r = validerRetour(lireRetour(bloc(mauvais)), analyse);
    expect(r.valides.map(v => v.ref)).toEqual(['F01']);
    expect(r.ecartees).toEqual([
      { ref: 'F02', raison: 'réponse incomplète (captions : exactement 2 captions de rôles différents.)' },
      { ref: 'F07', raison: 'référence inconnue' },
      { ref: 'F01', raison: 'référence en double' },
      { ref: '?', raison: 'référence inconnue' },
    ]);
  });
  it('signale les fiches du dossier absentes de la réponse', () => {
    const r = validerRetour(lireRetour(bloc({ ...objet, fiches: [jugement('F01')] })), analyse);
    expect(r.ecartees).toEqual([{ ref: 'F02', raison: 'absente de la réponse' }]);
  });
  it('tolère une période absente ou invalide', () => {
    expect(validerRetour(lireRetour(bloc({ dossier: 'D-abc123', fiches: [jugement('F01')] })), analyse).periode).toBeNull();
    expect(validerRetour(lireRetour(bloc({ ...objet, periode: { avis: 3 } })), analyse).periode).toBeNull();
    expect(validerRetour(lireRetour(bloc({ ...objet, periode: { avis: 'Ok.', points_forts: 'x', risques: [1, 'r'] } })), analyse).periode)
      .toEqual({ avis: 'Ok.', points_forts: [], risques: ['r'], ordre_conseille: [] });
  });
  it('écarte une fiche qui n’est pas un objet, avec la référence ?', () => {
    const r = validerRetour(lireRetour(bloc({ ...objet, fiches: [jugement('F01'), null, 'F02', 7, [jugement('F02')], jugement('F02')] })), analyse);
    expect(r.valides.map(v => v.ref)).toEqual(['F01', 'F02']);
    expect(r.ecartees).toEqual([
      { ref: '?', raison: 'référence inconnue' },
      { ref: '?', raison: 'référence inconnue' },
      { ref: '?', raison: 'référence inconnue' },
      { ref: '?', raison: 'référence inconnue' },
    ]);
  });
  it('ne lève jamais, quelle que soit l’entrée', () => {
    for (const x of [null, undefined, 42, 'texte', {}, { ok: false, raison: 'x' }, { ok: true }, { ok: true, fiches: null }]) {
      expect(() => validerRetour(x, analyse)).not.toThrow();
      const r = validerRetour(x, analyse);
      expect(r.valides).toEqual([]);
      expect(r.periode).toBeNull();
    }
    const lu = lireRetour(bloc(objet));
    for (const a of [null, undefined, 42, {}, { fiches: null }]) expect(() => validerRetour(lu, a)).not.toThrow();
  });
});
