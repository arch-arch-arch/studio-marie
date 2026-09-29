import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { depuisSaisieLocale } from '../../src/logique/dates.js';
import { fichesRemplacables, placerIdees, validerEntreeVeille } from '../../src/logique/veille.js';

const R = fictif.regles_studio;
const LUNDI = '2026-09-27T22:00:00.000Z';
let n = 0;
const fiche = (format, jour, heure, extra = {}) => ({
  ...nouvelleFiche({ id: `v${n++}`, format, date_heure: depuisSaisieLocale(jour, heure, R.fuseau), maintenant: LUNDI }),
  ...extra,
});
const jugement = () => ({
  notes: { accroche: 7, voix: 7, mecanique: 7 }, phrases: { accroche: 'a', voix: 'v', mecanique: 'm' },
  conformite: { etat: 'vert', causes: [] }, captions: [{ role: 'engagement', texte: 'x' }, { role: 'deadpan', texte: 'y' }],
  accroches: ['a1', 'a2'], hashtags: ['nuit'], recommandations: ['1', '2', '3'],
});
const idee = (extra = {}) => ({
  format: 'reel', pilier: 'nuit', role_caption: 'engagement', cta: false, format_valide: '', accroche: 'Une accroche.',
  caption: 'Une caption.', hashtags: ['nuit', 'club', 'paris'], tendance: null, jugement: jugement(), ...extra,
});
const tendance = t => ({ titre: t, source: 'https://exemple.test', date: '2026-09-25', pourquoi: 'p', adaptation: 'a', duree_vie: '2 semaines' });
const entree = (extra = {}) => ({
  sources_indisponibles: false, tendances: [tendance('T1'), tendance('T2'), tendance('T3')], ecartees: [], alertes: [],
  idees: [idee(), idee({ pilier: 'socio' }), idee({ format: 'carrousel', pilier: 'humour_sec' })], ...extra,
});

describe('fichesRemplacables', () => {
  it('ne garde que les idées de ce bulletin, en brouillon et jamais modifiées', () => {
    const cle = '2026-W40';
    const a = fiche('reel', '2026-09-28', '12:00', { statut: 'brouillon', origine: { type: 'veille', bulletin: cle } });
    const b = { ...a, id: 'b', modifiee_depuis_creation: true };
    const c = { ...a, id: 'c', statut: 'valide' };
    const d = { ...a, id: 'd', origine: { type: 'veille', bulletin: '2026-W39' } };
    const e = { ...a, id: 'e', origine: { type: 'manuelle' } };
    expect(fichesRemplacables([a, b, c, d, e], cle).map(f => f.id)).toEqual([a.id]);
  });
});

describe('placerIdees', () => {
  it('place sur les créneaux libres dans l’ordre, jamais sur un créneau pris', () => {
    const prise = fiche('reel', '2026-09-29', '12:30');
    const r = placerIdees([idee(), idee(), idee()], [prise], R, LUNDI);
    expect(r.map(p => p.date_heure)).toEqual(['2026-09-28T10:00:00.000Z', '2026-10-01T10:00:00.000Z', '2026-09-28T10:00:00.000Z']);
    expect(r.map(p => p.horsCreneau)).toEqual([false, false, true]);
  });
});

describe('validerEntreeVeille', () => {
  it('accepte une entrée complète et la normalise', () => {
    const r = validerEntreeVeille(entree(), R);
    expect(r.ok).toBe(true);
    expect(r.entree.tendances[0].son_a_verifier).toBe(false);
    expect(r.entree.alertes).toEqual([]);
    expect(r.entree.idees[0].jugement.captions).toHaveLength(2);
  });
  it('accepte zéro tendance seulement si les sources sont indisponibles', () => {
    expect(validerEntreeVeille(entree({ tendances: [] }), R).erreurs).toContain('tendances : 3 à 5 tendances attendues (ou sources_indisponibles à vrai).');
    expect(validerEntreeVeille(entree({ tendances: [], sources_indisponibles: true }), R).ok).toBe(true);
  });
  it('refuse le nombre d’idées hors de 3 à 5, un pilier inconnu, un jugement incomplet', () => {
    expect(validerEntreeVeille(entree({ idees: [idee(), idee()] }), R).erreurs).toContain('idees : 3 à 5 idées attendues.');
    const r = validerEntreeVeille(entree({ idees: [idee({ pilier: 'inconnu' }), idee({ jugement: { notes: {} } }), idee({ format: 'tiktok' })] }), R);
    expect(r.ok).toBe(false);
    expect(r.erreurs).toContain('idees[0].pilier inconnu : inconnu.');
    expect(r.erreurs.some(e => e.startsWith('idees[1].jugement :'))).toBe(true);
    expect(r.erreurs).toContain('idees[2].format inconnu : tiktok.');
  });
  it('refuse ce qui n’est pas un objet', () => {
    expect(validerEntreeVeille([], R)).toEqual({ ok: false, erreurs: ['L’entrée de la veille doit être un objet JSON.'] });
  });
});
