// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { vueMois } from '../../src/interface/vue-mois.js';
import { vueJour } from '../../src/interface/vue-jour.js';

const f = (id, format, date_heure, accroche = '') => ({ ...nouvelleFiche({ id, format, date_heure, pilier: 'socio', maintenant: 'x' }), accroche });
const actionsFactices = () => ({ changerVue: vi.fn(), creerFiche: vi.fn(), ouvrirFiche: vi.fn() });

describe('vueMois', () => {
  it('affiche 5 semaines pour octobre 2026, avec des points par format', () => {
    const actions = actionsFactices();
    const el = vueMois({ profil: fictif, fiches: [f('a', 'reel', '2026-10-01T10:00:00.000Z'), f('b', 'story', '2026-10-01T17:00:00.000Z')], ancre: '2026-10-15T10:00:00.000Z' }, actions);
    expect(el.querySelectorAll('.mois-semaine')).toHaveLength(5);
    const jours = el.querySelectorAll('.mois-jour');
    expect(jours).toHaveLength(35);
    expect(jours[0].classList.contains('hors-mois')).toBe(true);
    const premierOctobre = jours[3];
    expect(premierOctobre.querySelector('.mois-num').textContent).toBe('1');
    expect([...premierOctobre.querySelectorAll('.point-format')].map(p => p.className)).toEqual(['point-format format-reel', 'point-format format-story']);
    premierOctobre.click();
    expect(actions.changerVue).toHaveBeenCalledWith('jour', '2026-09-30T22:00:00.000Z');
  });
});

describe('vueJour', () => {
  it('liste les contenus du jour dans l’ordre des heures', () => {
    const el = vueJour({ profil: fictif, fiches: [f('b', 'story', '2026-09-28T17:00:00.000Z', 'soir'), f('a', 'reel', '2026-09-28T10:00:00.000Z', 'midi'), f('c', 'reel', '2026-09-29T10:00:00.000Z', 'lendemain')], ancre: '2026-09-28T08:00:00.000Z' }, actionsFactices());
    expect([...el.querySelectorAll('.frise-heure')].map(x => x.textContent)).toEqual(['12:00', '19:00']);
    expect(el.textContent).not.toContain('lendemain');
  });
  it('indique un jour vide et permet d’ajouter', () => {
    const actions = actionsFactices();
    const el = vueJour({ profil: fictif, fiches: [], ancre: '2026-09-28T08:00:00.000Z' }, actions);
    expect(el.textContent).toContain('Rien de prévu ce jour-là.');
    el.querySelector('button').click();
    expect(actions.creerFiche).toHaveBeenCalledWith({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
  });
});

describe('analyse par dossier', () => {
  const etat = (plus = {}) => ({ profil: fictif, fiches: [], ancre: '2026-10-15T10:00:00.000Z', ...plus });
  const bouton = el => [...el.querySelectorAll('button')].find(x => x.textContent === 'Analyser le mois');
  it('propose le bouton quand la capacité existe (Mois seulement)', () => {
    const a = { ...actionsFactices(), ouvrirAnalyse: vi.fn() };
    bouton(vueMois(etat(), a, { dossier: true })).click();
    expect(a.ouvrirAnalyse).toHaveBeenCalled();
    expect(bouton(vueMois(etat(), a, {}))).toBeUndefined();
    expect(bouton(vueMois(etat(), a))).toBeUndefined();
    const jour = vueJour(etat(), a, { dossier: true });
    expect([...jour.querySelectorAll('button')].some(b => /Analyser/.test(b.textContent))).toBe(false);
  });
  it('désactive le bouton pendant la préparation', () => {
    expect(bouton(vueMois(etat({ analyse: { etape: 'preparation' } }), actionsFactices(), { dossier: true })).disabled).toBe(true);
  });
  it('affiche l’avis du mois', () => {
    const analyses = [{ id: 'D-1', periode: { type: 'mois', cle: '2026-10' }, assistant: 'claude', fiches: [], retour: { recu_le: '2026-10-10T10:00:00.000Z', avis: 'Bon mois', points_forts: [], risques: [], ordre_conseille: [] } }];
    const el = vueMois(etat({ analyses }), actionsFactices(), { dossier: true });
    expect(el.querySelector('summary').textContent).toBe('Avis sur le mois');
  });
});
