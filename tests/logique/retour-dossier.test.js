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
    const mauvais = { ...objet, fiches: [jugement('F01'), jugement('F02', { accroches: ['Une'] }), jugement('F07'), jugement('F01'), { notes: {} }] };
    const r = validerRetour(lireRetour(bloc(mauvais)), analyse);
    expect(r.valides.map(v => v.ref)).toEqual(['F01']);
    expect(r.ecartees).toEqual([
      { ref: 'F02', raison: 'réponse incomplète (accroches : 2 ou 3 textes.)' },
      { ref: 'F07', raison: 'référence inconnue' },
      { ref: 'F01', raison: 'référence en double' },
      { ref: '?', raison: 'entrée sans référence' },
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
      { ref: '?', raison: 'entrée sans référence' },
      { ref: '?', raison: 'entrée sans référence' },
      { ref: '?', raison: 'entrée sans référence' },
      { ref: '?', raison: 'entrée sans référence' },
    ]);
  });
  it('ne lève jamais, quelle que soit l’entrée', () => {
    for (const x of [null, undefined, 42, 'texte', {}, { ok: false, raison: 'x' }, { ok: true }, { ok: true, fiches: null }]) {
      expect(() => validerRetour(x, analyse)).not.toThrow();
      const r = validerRetour(x, analyse);
      expect(r.valides).toEqual([]);
      expect(r.periode).toBeNull();
    }
    expect(validerRetour(null, analyse).ecartees).toEqual([{ ref: '?', raison: 'retour illisible' }]);
    const piege = { get fiches() { throw new Error('boum'); } };
    expect(validerRetour(lireRetour(bloc(objet)), piege)).toEqual({ valides: [], ecartees: [{ ref: '?', raison: 'retour illisible' }], periode: null });
    const lu = lireRetour(bloc(objet));
    for (const a of [null, undefined, 42, {}, { fiches: null }]) expect(() => validerRetour(lu, a)).not.toThrow();
  });
});

const exemple = (vide, code = 'D-abc123', refs = ['F01', 'F02']) => ({
  dossier: code,
  fiches: [{
    id: refs[0],
    notes: { accroche: 7, voix: 8, mecanique: 6 },
    phrases: { accroche: vide, voix: vide, mecanique: vide },
    conformite: { etat: 'vert', causes: [] },
    captions: [{ role: 'engagement', texte: vide }, { role: 'deadpan', texte: vide }],
    accroches: [vide, vide],
    hashtags: ['mot'],
    recommandations: [{ texte: vide, pourquoi: vide }, { texte: vide, pourquoi: vide }, { texte: vide, pourquoi: vide }],
  }],
  periode: { avis: vide, points_forts: [vide], risques: [vide], ordre_conseille: refs.slice(0, 2) },
});
const consigne = vide => `Tu es une éditrice exigeante.\nmecanique : première ligne qui provoque avant « …plus ».\n\nBloc à coller dans le studio : de cette forme exacte :\n\n${JSON.stringify(exemple(vide), null, 2)}\n\nContraintes du bloc : une entrée par fiche (F01 à F02) ; aucun texte après le bloc.`;
const valides = texte => validerRetour(lireRetour(texte), analyse);

describe('exemple de la consigne (correction 1)', () => {
  for (const vide of ['…', '...']) {
    it(`A : exemple (${vide}) puis vraie réponse coupée : aucune fiche valide`, () => {
      const texte = `${bloc(exemple(vide))}\n\nBloc à coller dans le studio :\n\`\`\`json\n${JSON.stringify(objet, null, 2).slice(0, 400)}`;
      const r = valides(texte);
      expect(r.valides).toEqual([]);
      expect(r.periode).toBeNull();
      expect(r.ecartees[0]).toEqual({ ref: 'F01', raison: 'exemple recopié, pas une analyse' });
    });
    it(`B : consigne (${vide}) collée seule : aucune fiche valide`, () => {
      const r = valides(consigne(vide));
      expect(r.valides).toEqual([]);
      expect(r.periode).toBeNull();
    });
    it(`C : vraie réponse complète après l’exemple (${vide}) : lue`, () => {
      const r = valides(`${bloc(exemple(vide))}\nPuis :\n${bloc(objet)}`);
      expect(r.valides.map(v => v.ref)).toEqual(['F01', 'F02']);
      expect(r.periode.avis).toBe('Bien.');
    });
  }
  it('écarte une fiche dont un seul texte est vide de sens', () => {
    const r = valides(bloc({ ...objet, fiches: [jugement('F01', { accroches: ['Une', '...'] })] }));
    expect(r.ecartees[0]).toEqual({ ref: 'F01', raison: 'exemple recopié, pas une analyse' });
  });
});

describe('marqueurs de citation réels (corrections 2 et 3)', () => {
  const avis = texte => lireRetour(bloc({ ...objet, periode: { ...objet.periode, avis: texte } })).periode.avis;
  it('retire fileciteturn0file0', () => { expect(avis('Bien fileciteturn0file0.')).toBe('Bien .'); });
  it('retire citeturn0search0turn1view2', () => { expect(avis('Bien citeturn0search0turn1view2.')).toBe('Bien .'); });
  it('retire le segment U+E200 à U+E201', () => {
    expect(avis('Bien \uE200cite\uE202turn0search0\uE201.')).toBe('Bien .');
    expect(avis('Bien \uE200filecite\uE202turn0file0\uE202turn0file1\uE201.')).toBe('Bien .');
  });
  it('retire un caractère privé isolé', () => {
    expect(avis('Bien\uE200 fin.')).toBe('Bien fin.');
    expect(avis('Bien fin\uE201.')).toBe('Bien fin.');
  });
  it('retire :contentReference[oaicite:2]{index=2}', () => { expect(avis('Bien :contentReference[oaicite:2]{index=2}.')).toBe('Bien .'); });
  it('retire toujours les formes déjà couvertes', () => {
    expect(avis('A :codex-file-citation{path="x"} B 【4†source】 C [oaicite:2] D')).toBe('A B C D');
  });
  it('garde « citeturn » seul et les mots légitimes', () => {
    expect(avis('Mot citeturn seul.')).toBe('Mot citeturn seul.');
    expect(avis('La Faciliteturn reste.')).toBe('La Faciliteturn reste.');
  });
  it('lit un bloc dont une valeur contient le marqueur brut non échappé', () => {
    const brut = JSON.stringify({ ...objet, periode: { ...objet.periode, avis: 'XX' } }, null, 2)
      .replace('XX', 'Bien. :codex-file-citation{path="x.pdf" purpose="source"} Fin.');
    expect(() => JSON.parse(brut)).toThrow();
    const r = lireRetour(`\`\`\`json\n${brut}\n\`\`\``);
    expect(r.ok).toBe(true);
    expect(r.periode.avis).toBe('Bien. Fin.');
  });
});

describe('détection de coupure (correction 4)', () => {
  it('petit bloc lisible sans rapport puis vraie réponse coupée : COUPE', () => {
    const coupe = `\`\`\`json\n${JSON.stringify(objet, null, 2).slice(0, 300)}`;
    expect(lireRetour(`\`\`\`json\n{"exemple": true}\n\`\`\`\n${coupe}`)).toEqual({ ok: false, raison: MESSAGE_COUPE });
    expect(lireRetour(`\`\`\`json\n42\n\`\`\`\n${coupe}`)).toEqual({ ok: false, raison: MESSAGE_COUPE });
  });
  it('un objet complet avec dossier mais sans fiches valides : SANS_BLOC', () => {
    expect(lireRetour(bloc({ dossier: 'D-abc123', fiches: 'non' }))).toEqual({ ok: false, raison: MESSAGE_SANS_BLOC });
  });
});

describe('références tolérantes (correction 5)', () => {
  it('accepte f01, " F1 " et un id numérique, pour id et ordre_conseille', () => {
    const o = { ...objet, fiches: [jugement('f01'), jugement(' F2 ')], periode: { ...objet.periode, ordre_conseille: ['f2', ' F1 ', 'F01', 2] } };
    const r = valides(bloc(o));
    expect(r.valides.map(v => [v.ref, v.id])).toEqual([['F01', 'a'], ['F02', 'b']]);
    expect(r.periode.ordre_conseille).toEqual(['F02', 'F01']);
    expect(valides(bloc({ ...objet, fiches: [jugement(1)] })).valides.map(v => v.ref)).toEqual(['F01']);
    expect(valides(bloc({ ...objet, fiches: [jugement('F001')] })).valides.map(v => v.ref)).toEqual(['F01']);
  });
});

describe('doublons (correction 6)', () => {
  it('garde la valide quand la première est invalide', () => {
    const mauvais = jugement('F01', { accroches: ['Une'] });
    const r = valides(bloc({ ...objet, fiches: [mauvais, jugement('F01'), jugement('F02')] }));
    expect(r.valides.map(v => v.ref)).toEqual(['F01', 'F02']);
    expect(r.ecartees).toEqual([{ ref: 'F01', raison: 'réponse incomplète (accroches : 2 ou 3 textes.)' }]);
  });
  it('garde la première de deux valides', () => {
    const r = valides(bloc({ ...objet, fiches: [jugement('F01', { hashtags: ['premier'] }), jugement('F01', { hashtags: ['second'] }), jugement('F02')] }));
    expect(r.valides[0].jugement.hashtags).toEqual(['premier']);
    expect(r.ecartees).toEqual([{ ref: 'F01', raison: 'référence en double' }]);
  });
});

describe('raisons lisibles (correction 7)', () => {
  it('liste toutes les erreurs, séparées par « ; »', () => {
    const r = valides(bloc({ ...objet, fiches: [jugement('F01', { accroches: ['Une'], hashtags: 'x' }), jugement('F02')] }));
    expect(r.ecartees).toEqual([{ ref: 'F01', raison: 'réponse incomplète (accroches : 2 ou 3 textes. ; hashtags : liste de textes.)' }]);
  });
  it('distingue une entrée sans référence d’une référence inconnue', () => {
    const r = valides(bloc({ ...objet, fiches: [jugement('F01'), jugement('F02'), jugement('F09'), { ...jugement('F01'), id: undefined }, jugement(null)] }));
    expect(r.ecartees).toEqual([
      { ref: 'F09', raison: 'référence inconnue' },
      { ref: '?', raison: 'entrée sans référence' },
      { ref: '?', raison: 'entrée sans référence' },
    ]);
  });
});

describe('période bornée (correction 8)', () => {
  it('retire les doublons et borne les longueurs', () => {
    const periode = { avis: 'a'.repeat(5000), points_forts: Array.from({ length: 20 }, (_, i) => `p${i}${'x'.repeat(600)}`), risques: ['r'], ordre_conseille: ['F02', 'F02', 'F01', 'f02'] };
    const p = valides(bloc({ ...objet, periode })).periode;
    expect(p.avis).toHaveLength(4000);
    expect(p.points_forts).toHaveLength(12);
    expect(p.points_forts.every(t => t.length === 500)).toBe(true);
    expect(p.ordre_conseille).toEqual(['F02', 'F01']);
  });
  it('un avis sans lettre ni chiffre donne une période nulle', () => {
    expect(valides(bloc({ ...objet, periode: { ...objet.periode, avis: '…' } })).periode).toBeNull();
  });
});

describe('passe finale B : variante de caption écartée, analyse gardée', () => {
  const avec = captions => valides(bloc({ ...objet, fiches: [jugement('F01', { captions }), jugement('F02')] }));
  it('garde la fiche et la caption valide quand l’autre a un rôle inconnu', () => {
    const r = avec([{ role: 'envoi', texte: 'x' }, { role: 'cta', texte: 'y' }]);
    expect(r.ecartees).toEqual([]);
    expect(r.valides.map(v => v.ref)).toEqual(['F01', 'F02']);
    expect(r.valides[0].jugement.captions).toEqual([{ role: 'cta', texte: 'y' }]);
    expect(r.valides[0].jugement.notes).toEqual({ accroche: 7, voix: 8, mecanique: 6 });
    expect(r.valides[0].remarque).toBe('variante de caption écartée : rôle inconnu envoi');
    expect('remarque' in r.valides[1]).toBe(false);
  });
  it('garde la fiche sans caption quand les deux rôles sont inconnus', () => {
    const r = avec([{ role: 'envoi', texte: 'x' }, { role: 'relance', texte: 'y' }]);
    expect(r.valides[0].jugement.captions).toEqual([]);
    expect(r.valides[0].remarque).toBe('variante de caption écartée : rôle inconnu envoi, relance');
  });
  it('signale un rôle manquant', () => {
    const r = avec([{ texte: 'x' }, { role: 'deadpan', texte: 'y' }]);
    expect(r.valides[0].jugement.captions).toEqual([{ role: 'deadpan', texte: 'y' }]);
    expect(r.valides[0].remarque).toBe('variante de caption écartée : rôle manquant');
  });
  it('signale deux fois le même rôle', () => {
    const r = avec([{ role: 'cta', texte: 'x' }, { role: 'cta', texte: 'y' }]);
    expect(r.valides[0].jugement.captions).toEqual([{ role: 'cta', texte: 'x' }]);
    expect(r.valides[0].remarque).toBe('variante de caption écartée : deux fois le même rôle');
  });
  it('écarte toujours la fiche pour une autre invalidité', () => {
    const r = valides(bloc({ ...objet, fiches: [jugement('F01', { captions: [{ role: 'envoi', texte: 'x' }, { role: 'cta', texte: 'y' }], accroches: ['Une'] }), jugement('F02')] }));
    expect(r.valides.map(v => v.ref)).toEqual(['F02']);
    expect(r.ecartees).toEqual([{ ref: 'F01', raison: 'réponse incomplète (accroches : 2 ou 3 textes.)' }]);
  });
  it('ne change rien quand les deux captions sont valides', () => {
    const r = avec([{ role: 'engagement', texte: 'a' }, { role: 'cta', texte: 'b' }]);
    expect('remarque' in r.valides[0]).toBe(false);
    expect(r.valides[0].jugement.captions).toHaveLength(2);
  });
});

describe('passe finale B : textes', () => {
  const un = plus => valides(bloc({ ...objet, fiches: [jugement('F01', plus)] }));
  it('ne prend pas une accroche d’un seul émoji ou « ?! » pour un exemple recopié', () => {
    expect(un({ accroches: ['🔥', '?!'] }).valides.map(v => v.ref)).toEqual(['F01']);
    expect(un({ accroches: ['Une', ' . … '] }).ecartees[0]).toEqual({ ref: 'F01', raison: 'exemple recopié, pas une analyse' });
  });
  it('reconvertit un code [U+1F525] en caractère, pour les codes valides seulement', () => {
    const j = un({
      captions: [{ role: 'engagement', texte: 'Feu [U+1F525] [U+110000] [U+D83D]' }, { role: 'deadpan', texte: 'B.' }],
      accroches: ['Une [U+1F525]', 'Deux'], recommandations: [{ texte: 'r [U+1F525]', pourquoi: 'p' }, { texte: 'r2', pourquoi: 'p' }, { texte: 'r3', pourquoi: 'p' }],
    }).valides[0].jugement;
    expect(j.captions[0].texte).toBe('Feu 🔥 [U+110000] [U+D83D]');
    expect(j.accroches[0]).toBe('Une 🔥');
    expect(j.recommandations[0].texte).toBe('r 🔥');
    const avis = valides(bloc({ ...objet, periode: { ...objet.periode, avis: 'Bien [U+1F525]' } })).periode.avis;
    expect(avis).toBe('Bien 🔥');
  });
  it('ne coupe pas une paire de substitution aux bornes de la période', () => {
    const p = valides(bloc({ ...objet, periode: { avis: `${'a'.repeat(3999)}🔥`, points_forts: [`${'b'.repeat(499)}🔥`], risques: ['r'], ordre_conseille: [] } })).periode;
    expect(p.avis).toBe('a'.repeat(3999));
    expect(p.points_forts[0]).toBe('b'.repeat(499));
  });
  it('retire les éléments faits uniquement de points des points forts et des risques', () => {
    const p = valides(bloc({ ...objet, periode: { avis: 'Ok.', points_forts: ['...', 'réel', '…'], risques: [' . ', 'autre'], ordre_conseille: [] } })).periode;
    expect(p.points_forts).toEqual(['réel']);
    expect(p.risques).toEqual(['autre']);
  });
});

describe('retouche : tri des captions en tout nombre', () => {
  const cap = (captions, extra = {}) => valides(bloc({ ...objet, fiches: [{ ...jugement('F01'), captions, ...extra }, jugement('F02')] }));
  const un = captions => cap(captions).valides[0];
  it('3 captions dont une inconnue : valide, 2 gardées', () => {
    const v = un([{ role: 'envoi', texte: 'x' }, { role: 'cta', texte: 'y' }, { role: 'deadpan', texte: 'z' }]);
    expect(v.jugement.captions).toEqual([{ role: 'cta', texte: 'y' }, { role: 'deadpan', texte: 'z' }]);
    expect(v.remarque).toBe('variante de caption écartée : rôle inconnu envoi');
  });
  it('3 captions valides : 2 gardées, remarque', () => {
    const v = un([{ role: 'cta', texte: 'a' }, { role: 'deadpan', texte: 'b' }, { role: 'engagement', texte: 'c' }]);
    expect(v.jugement.captions).toEqual([{ role: 'cta', texte: 'a' }, { role: 'deadpan', texte: 'b' }]);
    expect(v.remarque).toBe('variante de caption en trop écartée');
  });
  it('1 caption valide : 1 gardée, remarque', () => {
    const v = un([{ role: 'cta', texte: 'a' }]);
    expect(v.jugement.captions).toEqual([{ role: 'cta', texte: 'a' }]);
    expect(v.remarque).toBe('une seule variante de caption fournie');
  });
  it('captions absent ou non tableau : valide, 0 caption, remarque', () => {
    for (const captions of [undefined, 'x', []]) {
      const v = un(captions);
      expect(v.jugement.captions).toEqual([]);
      expect(v.remarque).toBe('aucune variante de caption fournie');
    }
  });
  it('une autre invalidité écarte toujours la fiche', () => {
    expect(cap([{ role: 'cta', texte: 'a' }], { accroches: ['Une'] }).ecartees[0].ref).toBe('F01');
  });
});
