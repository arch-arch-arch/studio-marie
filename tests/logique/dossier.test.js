import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import {
  FICHES_MAX, MESSAGE_A_COLLER, ligneRegle, enListes, periodeAffichee, choisirFiches, codeDossier, attribuerReferences, etatVisuel, versLatin1, contenuDossier,
} from '../../src/logique/dossier.js';

const FZ = 'Europe/Paris';
const profil = { ...fictif, version: 3 };
const fiche = (id, date_heure, plus = {}) => ({ ...nouvelleFiche({ id, format: 'reel', date_heure, pilier: profil.regles_studio.piliers[0].cle, maintenant: '2026-10-01T08:00:00.000Z' }), accroche: `Accroche ${id}`, caption: `Caption ${id}`, ...plus });

describe('periodeAffichee', () => {
  it('donne la semaine ou le mois affiché', () => {
    expect(periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ)).toEqual({
      type: 'semaine', cle: '2026-W41', debut: '2026-10-04T22:00:00.000Z', fin: '2026-10-11T22:00:00.000Z', libelle: 'semaine du 5 au 11 octobre 2026',
    });
    expect(periodeAffichee('mois', '2026-10-15T10:00:00.000Z', FZ)).toMatchObject({ type: 'mois', cle: '2026-10', debut: '2026-09-30T22:00:00.000Z', fin: '2026-10-31T23:00:00.000Z', libelle: 'octobre 2026' });
    expect(periodeAffichee('jour', '2026-10-07T10:00:00.000Z', FZ).type).toBe('semaine');
  });
});

describe('choisirFiches', () => {
  const periode = periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ);
  it('garde les fiches de la période qui ne sont pas publiées, par date', () => {
    const fiches = [
      fiche('b', '2026-10-08T10:00:00.000Z'), fiche('a', '2026-10-05T10:00:00.000Z'),
      fiche('p', '2026-10-06T10:00:00.000Z', { statut: 'publie' }), fiche('h', '2026-10-12T10:00:00.000Z'),
    ];
    const r = choisirFiches(fiches, periode);
    expect(r.ok).toBe(true);
    expect(r.fiches.map(f => f.id)).toEqual(['a', 'b']);
  });
  it('refuse une période vide ou trop chargée', () => {
    expect(choisirFiches([], periode)).toEqual({ ok: false, raison: 'Aucune fiche à analyser sur cette période.' });
    const trop = Array.from({ length: FICHES_MAX + 1 }, (_, i) => fiche(`f${i}`, '2026-10-06T10:00:00.000Z'));
    expect(choisirFiches(trop, periode)).toEqual({ ok: false, raison: 'Trop de fiches pour un seul dossier : analyse semaine par semaine.' });
  });
});

describe('références et code', () => {
  it('numérote les fiches et garde leur empreinte', () => {
    const fiches = [fiche('a', '2026-10-05T10:00:00.000Z'), fiche('b', '2026-10-06T10:00:00.000Z')];
    expect(attribuerReferences(fiches)).toEqual([
      { ref: 'F01', id: 'a', empreinte: empreinte(fiches[0]) }, { ref: 'F02', id: 'b', empreinte: empreinte(fiches[1]) },
    ]);
  });
  it('donne un code de dossier court', () => {
    expect(codeDossier(() => 0)).toMatch(/^D-[a-z0-9]{6}$/);
    expect(codeDossier()).not.toBe(codeDossier());
  });
});

describe('etatVisuel', () => {
  const f = plus => fiche('a', '2026-10-05T10:00:00.000Z', plus);
  it('couvre chaque cas de la spec', () => {
    expect(etatVisuel(f({}), null)).toEqual({ visuel: 'aucun', raison_visuel: null, mention: 'aucun' });
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'image' }), { ok: true })).toEqual({ visuel: 'joint', raison_visuel: null, mention: 'image' });
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'image', format: 'carrousel' }), { ok: true }).mention).toBe('image (une seule image du carrousel est fournie)');
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'video' }), { ok: true }).mention).toBe('vidéo (couverture et images extraites, de gauche à droite)');
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'video' }), { ok: false })).toEqual({ visuel: 'non_joint', raison_visuel: 'video', mention: 'vidéo, non jointe' });
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'image' }), { ok: false })).toEqual({ visuel: 'non_joint', raison_visuel: 'indisponible', mention: 'présent mais non joint' });
    expect(etatVisuel(f({ visuel: 'v', visuel_type: 'image' }), null).visuel).toBe('non_joint');
  });
});

describe('versLatin1', () => {
  it('garde le Latin-1, traduit la typographie et code le reste', () => {
    expect(versLatin1('Été « chic » à 5 €')).toBe('Été « chic » à 5 EUR');
    expect(versLatin1('l’œuvre… – fin — là')).toBe("l'oeuvre... - fin - là");
    expect(versLatin1('Feu 🔥 !')).toBe('Feu [U+1F525] !');
    expect(versLatin1('a b c')).toBe('a b c');
    expect(versLatin1(null)).toBe('');
  });
  it('ne lève jamais, même sur un émoji composé, un demi-caractère ou un caractère de contrôle', () => {
    const famille = '\u{1F468}\u200D\u{1F469}\u200D\u{1F467}\uFE0F';
    expect(() => versLatin1(famille)).not.toThrow();
    expect(versLatin1(famille)).toBe('[U+1F468][U+1F469][U+1F467]');
    expect(versLatin1('\uD83D')).toBe('[U+D83D]');
    expect(versLatin1('x\uDE00y')).toBe('x[U+DE00]y');
    expect(versLatin1('a\u0000b\u0007c\u0085d')).toBe('a b c d');
    expect(versLatin1(42)).toBe('42');
  });
});

describe('enListes', () => {
  it('écrit des listes lisibles, sans JSON brut', () => {
    const lignes = enListes({ a_b: 'x', n: null, v: true, f: false, nb: 3, liste: ['un', { k: 'v', vide: null }], sous: { z: [1, 2], o: { p: 'q' } } });
    const texte = lignes.join('\n');
    expect(texte).not.toContain('{"');
    expect(texte).not.toMatch(/\bnull\b|\btrue\b|\bfalse\b|\bundefined\b|\[object/);
    expect(texte).toContain('- a b : x');
    expect(texte).toContain('- n : non renseigné');
    expect(texte).toContain('- v : oui');
    expect(texte).toContain('- f : non');
    expect(texte).toContain('- un');
    expect(texte).toContain('- k : v');
    expect(lignes.every(l => typeof l === 'string')).toBe(true);
  });
  it('couvre aussi une valeur seule', () => {
    expect(enListes(null)).toEqual(['non renseigné']);
    expect(enListes(false)).toEqual(['non']);
    expect(enListes('texte')).toEqual(['texte']);
  });
});

describe('contenuDossier', () => {
  const periode = periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ);
  const f1 = fiche('a', '2026-10-05T10:00:00.000Z', { visuel: 'v1', visuel_type: 'image', hashtags: ['nuit', 'club'], cta: true, role_caption: 'cta', caption: 'Feu 🔥' });
  const f2 = fiche('b', '2026-10-06T16:30:00.000Z', { format: 'story' });
  const entrees = [
    { ref: 'F01', fiche: f1, etat: etatVisuel(f1, { ok: true }) },
    { ref: 'F02', fiche: f2, etat: etatVisuel(f2, null) },
  ];
  const c = contenuDossier({ profil, entrees, periode, code: 'D-abc123', toutesLesFiches: [f1, f2] });
  const texteStrategie = c.strategie.flatMap(s => [s.titre, ...s.lignes]).join(' / ');

  it('présente la période, le code et la stratégie avant les fiches', () => {
    expect(c.titre).toBe("Dossier d'analyse : semaine du 5 au 11 octobre 2026");
    expect(c.intro).toContain('D-abc123');
    expect(c.strategie.length).toBeGreaterThan(0);
    expect(c.sectionsProfil).toContain('regles_studio');
    expect(c.strategie.every(s => typeof s.titre === 'string' && s.lignes.every(l => typeof l === 'string'))).toBe(true);
    expect(texteStrategie).not.toContain('{"');
    expect(texteStrategie).not.toMatch(/\bnull\b|\bundefined\b|\[object/);
  });
  it('donne les règles de la période', () => {
    expect(c.regles.join('\n')).toContain('Reels');
    expect(c.regles.join('\n')).toContain('2026-W41');
  });
  it('décrit chaque fiche dans un bloc délimité', () => {
    expect(c.fiches.map(x => x.ref)).toEqual(['F01', 'F02']);
    expect(c.fiches[0].etiquette).toBe('F01 · lun. 05/10 · Reel');
    const lignes = c.fiches[0].lignes;
    expect(lignes[0]).toBe('<fiche id="F01">');
    expect(lignes.at(-1)).toBe('</fiche>');
    const texte = lignes.join('\n');
    for (const attendu of ['date : lundi 5 octobre 2026, 12:00', 'format : Reel', `pilier : ${profil.regles_studio.piliers[0].nom}`, 'rôle de caption : cta', "appel vers l'offre : oui", 'mène à la porte : non', 'accroche : Accroche a', 'caption : Feu [U+1F525]', 'hashtags : nuit, club', 'visuel : image', 'alertes calculées :', 'blocages calculés :']) {
      expect(texte).toContain(attendu);
    }
    expect(c.fiches[1].lignes.join('\n')).toContain('visuel : aucun');
    expect(c.fiches[1].lignes.join('\n')).toContain('hashtags : aucun');
  });
  it('termine par la consigne, le code et la forme de la réponse', () => {
    const consigne = c.consigne.join('\n');
    for (const attendu of ['"dossier": "D-abc123"', 'engagement, cta, deadpan', 'Bloc à coller dans le studio :', '"periode"', '"ordre_conseille"', 'F01', '[U+', "une simple question au public n'est pas un appel vers l'offre", 'exactement 3 recommandations']) {
      expect(consigne).toContain(attendu);
    }
  });
  it('demande une analyse courte quand le dossier est long', () => {
    const beaucoup = Array.from({ length: 11 }, (_, i) => ({ ref: `F${String(i + 1).padStart(2, '0')}`, fiche: fiche(`x${i}`, '2026-10-05T10:00:00.000Z'), etat: etatVisuel(fiche('z', '2026-10-05T10:00:00.000Z'), null) }));
    const long = contenuDossier({ profil, entrees: beaucoup, periode, code: 'D-abc123', toutesLesFiches: beaucoup.map(e => e.fiche) });
    expect(long.consigne.join('\n')).toContain('au plus trois lignes par fiche');
    expect(c.consigne.join('\n')).not.toContain('au plus trois lignes par fiche');
  });
  it('fixe le message à coller', () => {
    expect(MESSAGE_A_COLLER).toBe('Voici le dossier d’analyse de mes contenus. Lis-le en entier, regarde chaque visuel, puis réponds en suivant exactement la consigne qui se trouve à la fin du dossier.');
  });
});

describe('correction 1 : règles de la période lisibles', () => {
  const periode = periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ);
  const f1 = fiche('a', '2026-10-05T10:00:00.000Z');
  const c = contenuDossier({ profil, entrees: [{ ref: 'F01', fiche: f1, etat: etatVisuel(f1, null) }], periode, code: 'D-abc123', toutesLesFiches: [f1] });
  it('utilise une légende et des libellés propres au dossier', () => {
    expect(c.regles[0]).toBe("Pour chaque semaine, l'état (vert, orange ou rouge) dit si la cadence prévue est tenue. Ces états ne concernent pas la conformité d'un contenu.");
    const texte = c.regles.join('\n');
    expect(texte).toContain("- Appels vers l'offre : ");
    expect(JSON.stringify(c)).not.toContain("Appels à l'action");
    expect(JSON.stringify(c)).not.toContain('compté/objectif');
  });
});

describe('passe finale A : une ligne exacte par règle', () => {
  const periode = periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ);
  const p = profil.regles_studio.piliers.map(x => x.cle);
  const fiches = [
    fiche('r1', '2026-10-05T10:00:00.000Z', { format: 'reel', cta: true, role_caption: 'cta', pilier: p[0] }),
    fiche('c1', '2026-10-06T10:00:00.000Z', { format: 'carrousel', role_caption: 'engagement', pilier: p[1] }),
    fiche('p1', '2026-10-07T10:00:00.000Z', { format: 'post', role_caption: 'engagement', pilier: p[2], ragebait: true }),
    fiche('s1', '2026-10-05T11:00:00.000Z', { format: 'story' }),
    fiche('s2', '2026-10-06T11:00:00.000Z', { format: 'story' }),
  ];
  const e = fiches.map((f, i) => ({ ref: `F0${i + 1}`, fiche: f, etat: etatVisuel(f, null) }));
  const lignes = contenuDossier({ profil, entrees: e, periode, code: 'D-abc123', toutesLesFiches: fiches }).regles;
  it.each([
    '- Reels : 1 sur 4 attendus (rouge)',
    '- Carrousels : 1 sur 2 attendus (orange)',
    '- Jours avec stories : 2 sur 7 (rouge)',
    "- Appels vers l'offre : 1 sur 3 contenus du fil, maximum 25 % (orange)",
    '- Rôles des captions : engagement 2, cta 1, deadpan 0 ; objectifs 2, 1, 1 (orange)',
    '- Ragebait : 1, maximum 1 (vert)',
    '- Stories vers la porte : 0, objectif 2 à 3 (rouge)',
    '- Piliers présents : 3 sur 4 (orange)',
  ])('écrit « %s »', attendue => {
    expect(lignes).toContain(attendue);
  });
  it('garde « libellé : valeur (état) » pour une clé inconnue', () => {
    expect(ligneRegle({ cle: 'autre', libelle: 'Autre', valeur: '3', etat: 'vert' }, profil.regles_studio)).toBe('Autre : 3 (vert)');
  });
});

describe('passe finale A : retrait et troncature', () => {
  const periode = periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ);
  const bloc = plus => {
    const f = fiche('a', '2026-10-05T10:00:00.000Z', plus);
    return contenuDossier({ profil, periode, code: 'D-abc123', toutesLesFiches: [f], entrees: [{ ref: 'F01', fiche: f, etat: etatVisuel(f, null) }] }).fiches[0].lignes;
  };
  it('met en retrait les lignes de suite d’une caption ou d’une accroche', () => {
    const l = bloc({ caption: 'une\nPS : deux\r\ntrois', accroche: 'haut\nbas' });
    expect(l).toContain('caption : une');
    expect(l).toContain('  PS : deux');
    expect(l).toContain('  trois');
    expect(l).toContain('accroche : haut');
    expect(l).toContain('  bas');
  });
  it('ne laisse jamais une demi-paire de substitution après la coupe', () => {
    const l = bloc({ accroche: `${'a'.repeat(299)}🔥`, caption: `${'b'.repeat(2199)}🔥`, geotag: `${'g'.repeat(199)}🔥` });
    const texte = l.join('\n');
    expect(texte).not.toMatch(/\[U\+D8/);
    expect(texte).toContain(`accroche : ${'a'.repeat(299)}`);
  });
});

describe('correction 1 : enListes et indentation', () => {
  it('aligne les clés d’un objet de liste, gère les vides et les textes multi-lignes', () => {
    const v = { liste: [{ a: 1, b: 2 }, ['x', 'y']], vide: [], o: {}, s: '', m: 'l1\nl2' };
    expect(enListes(v)).toEqual([
      '- liste :', '  - a : 1', '    b : 2', '  - liste :', '    - x', '    - y',
      '- vide : aucun', '- o : aucun', '- s : non renseigné', '- m : l1', '    l2',
    ]);
  });
  it('indente sous la clé les listes d’un objet de liste', () => {
    expect(enListes({ l: [{ k: ['p'], z: 1 }] })).toEqual(['- l :', '  - k :', '      - p', '    z : 1']);
  });
  it('gère les éléments vides ou multi-lignes dans une liste', () => {
    expect(enListes(['', [], {}, 'u\nv'])).toEqual(['- non renseigné', '- aucun', '- aucun', '- u', '    v']);
  });
});

describe('correction 1 : versLatin1 étendu', () => {
  it('normalise en NFC et traduit les signes courants', () => {
    expect(versLatin1('e\u0301te\u0301')).toBe('été');
    expect(versLatin1('a\u2011b\u2212c')).toBe('a-b-c');
    expect(versLatin1('a\u200Bb')).toBe('ab');
    expect(versLatin1('\u201Ex\u201C \u2039y\u203A')).toBe('"x" <y>');
    expect(versLatin1('Marque\u2122 \uFB01n \uFB02ot')).toBe('Marque(TM) fin flot');
    expect(versLatin1('a\r\nb\rc')).toBe('a\nb\nc');
  });
});

describe('correction 1 : libellé de semaine', () => {
  it('nomme les deux mois ou les deux années quand la semaine est à cheval', () => {
    expect(periodeAffichee('semaine', '2026-09-30T10:00:00.000Z', FZ).libelle).toBe('semaine du 28 septembre au 4 octobre 2026');
    expect(periodeAffichee('semaine', '2026-12-30T10:00:00.000Z', FZ).libelle).toBe('semaine du 28 décembre 2026 au 3 janvier 2027');
    expect(periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ).libelle).toBe('semaine du 5 au 11 octobre 2026');
  });
});

describe('correction 1 : consigne', () => {
  const periode = periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ);
  const f1 = fiche('a', '2026-10-05T10:00:00.000Z');
  const seul = contenuDossier({ profil, entrees: [{ ref: 'F01', fiche: f1, etat: etatVisuel(f1, null) }], periode, code: 'D-abc123', toutesLesFiches: [f1] });
  const texte = seul.consigne.join('\n');
  it('ne promet le bandeau que pour les visuels joints', () => {
    expect(texte).not.toContain('écrite en gros sur le bandeau noir de son visuel.');
    expect(texte).toContain('indiquée dans son bloc');
    expect(texte).toContain('quand un visuel est joint');
    expect(seul.intro).toContain('dans son bloc');
    expect(seul.intro).toContain('quand un visuel est joint');
  });
  it('précise le critère voix, les émojis et les références', () => {
    expect(texte).toContain('esthétique si le visuel est joint');
    expect(texte).toContain("Quand le visuel n'est pas joint, juge le texte seul et dis-le dans la phrase du critère.");
    expect(texte).toContain('Dans tes captions et tes accroches, écris de vrais émojis si tu en utilises, jamais leur code entre crochets.');
    expect(texte).toContain('(F01) ;');
    expect(texte).not.toContain('F01 à F01');
    expect(texte).toContain('parmi engagement, cta, deadpan');
  });
});

describe('correction 1 : bloc de fiche', () => {
  const periode = periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ);
  const longue = fiche('a', '2026-10-05T10:00:00.000Z', {
    accroche: 'A'.repeat(400), caption: 'première ligne\nseconde ligne\r\ntroisième', geotag: 'G'.repeat(300), hashtags: Array.from({ length: 40 }, (_, i) => `t${i}`),
  });
  const grande = fiche('b', '2026-10-05T10:00:00.000Z', { caption: 'C'.repeat(3000) });
  const c = contenuDossier({
    profil, periode, code: 'D-abc123', toutesLesFiches: [longue, grande],
    entrees: [{ ref: 'F01', fiche: longue, etat: etatVisuel(longue, null) }, { ref: 'F02', fiche: grande, etat: etatVisuel(grande, null) }],
  });
  const lignes = c.fiches[0].lignes;
  it('ne met aucun saut de ligne dans un élément et garde les lignes de caption', () => {
    expect(lignes.every(l => !l.includes('\n'))).toBe(true);
    expect(lignes.at(-1)).toBe('</fiche>');
    const i = lignes.indexOf('caption : première ligne');
    expect(i).toBeGreaterThan(-1);
    expect(lignes.slice(i + 1, i + 3)).toEqual(['  seconde ligne', '  troisième']);
    expect(lignes[i + 3]).toMatch(/^hashtags : /);
  });
  it('applique les mêmes limites que le prompt existant', () => {
    expect(lignes).toContain(`accroche : ${'A'.repeat(300)}`);
    expect(lignes).toContain(`géotag : ${'G'.repeat(200)}`);
    expect(lignes.find(l => l.startsWith('hashtags : ')).split(', ')).toHaveLength(30);
    expect(c.fiches[1].lignes).toContain(`caption : ${'C'.repeat(2200)}`);
  });
});

describe('retouche : causes des états qui ne se déduisent pas des nombres', () => {
  const periode = periodeAffichee('semaine', '2026-10-07T10:00:00.000Z', FZ);
  const p = profil.regles_studio.piliers.map(x => x.cle);
  const regles = fiches => contenuDossier({
    profil, periode, code: 'D-abc123', toutesLesFiches: fiches,
    entrees: fiches.map((f, i) => ({ ref: `F0${i + 1}`, fiche: f, etat: etatVisuel(f, null) })),
  }).regles;
  it('dit « aucun appel » pour un orange à 0 sur 4 contenus du fil ou plus', () => {
    const fiches = [0, 1, 2, 3].map(i => fiche(`r${i}`, `2026-10-0${5 + (i % 3)}T10:00:00.000Z`, { pilier: p[i] }));
    expect(regles(fiches)).toContain("- Appels vers l'offre : 0 sur 4 contenus du fil, maximum 25 % (orange : aucun appel vers l'offre cette semaine)");
  });
  it('n’ajoute pas de cause sous 4 contenus du fil', () => {
    const fiches = [fiche('a', '2026-10-05T10:00:00.000Z'), fiche('b', '2026-10-06T10:00:00.000Z', { pilier: p[1] })];
    expect(regles(fiches)).toContain("- Appels vers l'offre : 0 sur 2 contenus du fil, maximum 25 % (vert)");
  });
  it('dit qu’un pilier domine plus de la moitié du fil', () => {
    const fiches = [0, 1, 2].map(i => fiche(`d${i}`, `2026-10-0${5 + i}T10:00:00.000Z`, { pilier: p[0] })).concat(fiche('e', '2026-10-08T10:00:00.000Z', { pilier: p[1] }));
    expect(regles(fiches)).toContain('- Piliers présents : 2 sur 4 (rouge : un pilier domine plus de la moitié du fil)');
  });
});
