import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import {
  FICHES_MAX, MESSAGE_A_COLLER, enListes, periodeAffichee, choisirFiches, codeDossier, attribuerReferences, etatVisuel, versLatin1, contenuDossier,
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
    expect(texte).not.toMatch(/null|true|false|undefined|\[object/);
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
    expect(texteStrategie).not.toMatch(/null|undefined|\[object/);
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
