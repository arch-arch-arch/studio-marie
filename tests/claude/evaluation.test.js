import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import {
  extraireProfil, construirePrompt, validerReponse, messageErreurSample, CODES_INDISPONIBLES, TAILLE_PROFIL_MAX, TAILLE_PROMPT_MAX,
} from '../../src/claude/evaluation.js';

const octets = t => new TextEncoder().encode(t).length;

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
  it('reste sous la taille maximale (en octets) pour un profil volumineux, règles gardées', () => {
    const texte = extraireProfil(gros);
    expect(octets(texte)).toBeLessThanOrEqual(TAILLE_PROFIL_MAX);
    expect(texte).toContain('"regles_studio"');
  });
  it('garde toujours regles_studio, même si une autre section est énorme, et reste un JSON valide', () => {
    const enorme = { ...profil, ton_et_voix: 'é’«»'.repeat(10000) };
    const texte = extraireProfil(enorme);
    expect(() => JSON.parse(texte)).not.toThrow();
    expect(JSON.parse(texte).regles_studio).toBeTruthy();
    expect(octets(texte)).toBeLessThanOrEqual(TAILLE_PROFIL_MAX);
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
    expect(octets(p)).toBeLessThan(60000);
  });
  it('reste sous TAILLE_PROMPT_MAX même avec un profil énorme, une longue caption et 30 fiches de semaine', () => {
    const profilEnorme = {
      ...profil,
      ton_et_voix: 'é’«»'.repeat(10000),
      identite_de_marque: 'a'.repeat(5000),
      vocabulaire: 'b'.repeat(5000),
      regles_do: 'c'.repeat(5000),
      regles_dont: 'd'.repeat(5000),
      formats_de_contenu: 'e'.repeat(5000),
      audience: 'f'.repeat(5000),
      principe_directeur_final: 'g'.repeat(5000),
    };
    const p = construirePrompt({
      fiche: fiche({ caption: '’'.repeat(5000) }),
      profil: profilEnorme,
      verification,
      fichesSemaine: Array.from({ length: 30 }, (_, i) => ({ ...fiche(), id: `s${i}` })),
    });
    expect(octets(p)).toBeLessThanOrEqual(TAILLE_PROMPT_MAX);
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
  it('retire les espaces à l’intérieur de chaque hashtag avant analyse', () => {
    const r = validerReponse({ ...valide(), hashtags: ['vie nocturne'] });
    expect(r.jugement.hashtags).toEqual(['vienocturne']);
  });
});

describe('messageErreurSample', () => {
  it('traduit les codes et signale l’indisponibilité', () => {
    expect(messageErreurSample({ code: 'rate_limited' })).toBe('Trop de demandes à Claude pour le moment : réessaie un peu plus tard.');
    expect(messageErreurSample({ code: 'truc' })).toBe('L’évaluation a échoué (service indisponible) : réessaie. Rien n’a été modifié.');
    expect(CODES_INDISPONIBLES.has('not_granted')).toBe(true);
    expect(CODES_INDISPONIBLES.has('rate_limited')).toBe(false);
  });
  it('rend une chaîne vide pour une annulation', () => {
    expect(messageErreurSample({ code: 'cancelled' })).toBe('');
  });
  it('signale un visuel indisponible dans cette vue', () => {
    expect(messageErreurSample({ code: 'images_unavailable' })).toBe('Le visuel ne peut pas être envoyé à Claude dans cette vue : retire-le ou évalue depuis un autre appareil.');
  });
  it('regroupe les erreurs internes du studio', () => {
    const message = 'Erreur interne du studio : l’évaluation n’a pas pu être envoyée. Rien n’a été modifié.';
    expect(messageErreurSample({ code: 'invalid_request' })).toBe(message);
    expect(messageErreurSample({ code: 'transform_error' })).toBe(message);
    expect(messageErreurSample({ code: 'queue_overflow' })).toBe(message);
  });
  it('propose de simplifier le contenu quand Claude ne répond rien', () => {
    expect(messageErreurSample({ code: 'empty_completion' })).toBe('Claude n’a rien répondu : simplifie le contenu, puis réessaie. Rien n’a été modifié.');
  });
  it('précise quoi raccourcir quand le contenu envoyé à Claude est trop volumineux', () => {
    expect(messageErreurSample({ code: 'prompt_too_large' })).toBe('Le contenu envoyé à Claude est trop volumineux : raccourcis la caption, les hashtags ou le géotag.');
  });
});
