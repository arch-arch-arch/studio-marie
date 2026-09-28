import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import {
  extraireProfil, construirePrompt, validerReponse, messageErreurSample, CODES_INDISPONIBLES, TAILLE_PROFIL_MAX,
} from '../../src/claude/evaluation.js';

const profil = { ...fictif, version: 2 };
const fiche = (extra = {}) => ({
  ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: '2026-09-28T10:00:00.000Z', pilier: 'socio', maintenant: 'x' }),
  accroche: 'Accroche test', caption: 'Caption test', hashtags: ['nuit'], ...extra,
});
const verification = { conformite: { etat: 'vert', causes: [] }, alertes: [], mesures: { motsAccroche: 2, nbHashtags: 1 } };
const gros = {
  ...profil,
  formats_de_contenu: { scripts: 'a'.repeat(50000) },
  exemples_de_reference: { reels: 'b'.repeat(50000) },
  analyse_du_compte: { detail: 'c'.repeat(50000) },
};
const valide = () => ({
  notes: { accroche: 8, voix: 7, mecanique: 6 },
  phrases: { accroche: ' Nette. ', voix: 'Juste.', mecanique: 'Correcte.' },
  conformite: { etat: 'vert', causes: [] },
  captions: [{ role: 'engagement', texte: ' V1 ' }, { role: 'deadpan', texte: 'V2' }],
  accroches: ['A1', 'A2'],
  hashtags: ['#nuit', 'Nuit', 'socio'],
  recommandations: ['R1', 'R2', 'R3'],
});

describe('extraireProfil', () => {
  it('garde les sections utiles et écarte les exemples et l’analyse', () => {
    const texte = extraireProfil(profil);
    expect(texte).toContain('"regles_studio"');
    expect(texte).toContain('"ton_et_voix"');
    expect(extraireProfil(gros)).not.toContain('bbbb');
    expect(extraireProfil(gros)).not.toContain('cccc');
  });
  it('reste sous la taille maximale pour un profil volumineux, règles gardées', () => {
    const texte = extraireProfil(gros);
    expect(texte.length).toBeLessThanOrEqual(TAILLE_PROFIL_MAX);
    expect(texte).toContain('"regles_studio"');
  });
});

describe('construirePrompt', () => {
  it('contient le contenu, l’heure locale, les règles calculées et la semaine', () => {
    const autre = { ...fiche({ accroche: 'Autre de la semaine' }), id: 'f2' };
    const p = construirePrompt({ fiche: fiche(), profil, verification, fichesSemaine: [fiche(), autre] });
    expect(p).toContain('Accroche test');
    expect(p).toContain('"date_heure_locale":"2026-09-28 12:00"');
    expect(p).toContain(JSON.stringify(verification));
    expect(p).toContain('Autre de la semaine');
    expect(p.split('Accroche test').length - 1).toBe(1);
    expect(p).toContain('"visuel":"aucun"');
  });
  it('dit si le visuel est joint', () => {
    expect(construirePrompt({ fiche: fiche({ visuel: 'a1' }), profil, verification, avecImage: true })).toContain('"visuel":"joint à ce message"');
    expect(construirePrompt({ fiche: fiche({ visuel: 'a1' }), profil, verification })).toContain('"visuel":"présent mais non joint"');
  });
  it('reste sous la limite de 64 Kio avec un profil volumineux', () => {
    const p = construirePrompt({ fiche: fiche({ caption: 'x'.repeat(2000) }), profil: gros, verification, fichesSemaine: Array.from({ length: 20 }, (_, i) => ({ ...fiche(), id: `s${i}` })) });
    expect(new TextEncoder().encode(p).length).toBeLessThan(60000);
  });
});

describe('validerReponse', () => {
  it('accepte une réponse complète et la normalise', () => {
    const r = validerReponse(valide());
    expect(r.ok).toBe(true);
    expect(r.jugement.phrases.accroche).toBe('Nette.');
    expect(r.jugement.captions).toEqual([{ role: 'engagement', texte: 'V1' }, { role: 'deadpan', texte: 'V2' }]);
    expect(r.jugement.hashtags).toEqual(['nuit', 'socio']);
  });
  it('refuse ce qui n’est pas un objet', () => {
    expect(validerReponse([])).toEqual({ ok: false, erreurs: ['La réponse n’est pas un objet JSON.'] });
    expect(validerReponse(null).ok).toBe(false);
  });
  it('liste chaque manque', () => {
    const r = validerReponse({ ...valide(), notes: { accroche: 8, voix: 11, mecanique: 6 }, phrases: { voix: 'a', mecanique: 'b' } });
    expect(r.erreurs).toEqual(['phrases.accroche manquante.', 'notes.voix doit être un nombre de 0 à 10.']);
    expect(validerReponse({ ...valide(), captions: [{ role: 'cta', texte: 'a' }, { role: 'cta', texte: 'b' }] }).erreurs)
      .toEqual(['captions : exactement 2 captions de rôles différents.']);
    expect(validerReponse({ ...valide(), recommandations: ['a', 'b'] }).erreurs).toEqual(['recommandations : exactement 3 textes.']);
    expect(validerReponse({ ...valide(), accroches: ['a'] }).erreurs).toEqual(['accroches : 2 ou 3 textes.']);
    expect(validerReponse({ ...valide(), conformite: { etat: 'bleu', causes: [] } }).erreurs).toEqual(['conformite.etat doit valoir vert, orange ou rouge.']);
  });
});

describe('messageErreurSample', () => {
  it('traduit les codes et signale l’indisponibilité', () => {
    expect(messageErreurSample({ code: 'rate_limited' })).toBe('Trop de demandes à Claude pour le moment : réessaie un peu plus tard.');
    expect(messageErreurSample({ code: 'truc' })).toBe('L’évaluation a échoué (service indisponible) : réessaie. Rien n’a été modifié.');
    expect(CODES_INDISPONIBLES.has('not_granted')).toBe(true);
    expect(CODES_INDISPONIBLES.has('rate_limited')).toBe(false);
  });
});
