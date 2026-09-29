import { describe, it, expect } from 'vitest';
import {
  partiesLocales, versUtc, ajouterJours, debutJour, debutSemaine, joursDeLaSemaine,
  debutMois, ajouterMois, semainesDuMois, cleJour, heureLocale, depuisSaisieLocale, libelleJour, cleSemaineIso,
} from '../../src/logique/dates.js';

const FZ = 'Europe/Paris';

describe('conversions', () => {
  it('lit les parties locales (heure d’été)', () => {
    expect(partiesLocales('2026-09-28T10:00:00.000Z', FZ)).toEqual({ annee: 2026, mois: 9, jour: 28, heure: 12, minute: 0, jourSemaine: 1 });
  });
  it('convertit une heure locale en UTC, été comme hiver', () => {
    expect(versUtc({ annee: 2026, mois: 9, jour: 28, heure: 12 }, FZ)).toBe('2026-09-28T10:00:00.000Z');
    expect(versUtc({ annee: 2026, mois: 12, jour: 1, heure: 12 }, FZ)).toBe('2026-12-01T11:00:00.000Z');
  });
  it('fait l’aller-retour saisie locale ↔ UTC', () => {
    const iso = depuisSaisieLocale('2026-10-01', '13:45', FZ);
    expect(iso).toBe('2026-10-01T11:45:00.000Z');
    expect(cleJour(iso, FZ)).toBe('2026-10-01');
    expect(heureLocale(iso, FZ)).toBe('13:45');
  });
  it('rattache 23 h 30 locale au bon jour', () => {
    expect(cleJour('2026-10-25T22:30:00.000Z', FZ)).toBe('2026-10-25');
  });
  it('place une heure inexistante (passage à l’heure d’été) juste après le saut', () => {
    expect(versUtc({ annee: 2026, mois: 3, jour: 29, heure: 2, minute: 30 }, FZ)).toBe('2026-03-29T01:30:00.000Z');
    expect(ajouterJours('2026-03-28T01:30:00.000Z', 1, FZ)).toBe('2026-03-29T01:30:00.000Z');
    expect(versUtc({ annee: 2026, mois: 3, jour: 29, heure: 12 }, FZ)).toBe('2026-03-29T10:00:00.000Z');
  });
});

describe('semaines et jours', () => {
  it('trouve le lundi 00 h 00 local', () => {
    expect(debutSemaine('2026-10-01T15:00:00.000Z', FZ)).toBe('2026-09-27T22:00:00.000Z');
    expect(debutJour('2026-10-01T15:00:00.000Z', FZ)).toBe('2026-09-30T22:00:00.000Z');
  });
  it('garde l’heure locale en traversant le changement d’heure', () => {
    expect(ajouterJours('2026-10-24T10:00:00.000Z', 1, FZ)).toBe('2026-10-25T11:00:00.000Z');
  });
  it('liste 7 jours justes pendant la semaine du changement d’heure', () => {
    const debut = debutSemaine('2026-10-21T10:00:00.000Z', FZ);
    expect(debut).toBe('2026-10-18T22:00:00.000Z');
    const jours = joursDeLaSemaine(debut, FZ);
    expect(jours).toHaveLength(7);
    expect(jours.map(j => cleJour(j, FZ))).toEqual(['2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24', '2026-10-25']);
    expect(ajouterJours(debut, 7, FZ)).toBe('2026-10-25T23:00:00.000Z');
  });
  it('libelle un jour en français', () => {
    expect(libelleJour('2026-09-28T10:00:00.000Z', FZ)).toMatch(/^lun\.? 28$/);
  });
});

describe('mois', () => {
  it('calcule le début du mois et le mois suivant', () => {
    expect(debutMois('2026-10-15T10:00:00.000Z', FZ)).toBe('2026-09-30T22:00:00.000Z');
    expect(ajouterMois('2026-10-15T10:00:00.000Z', 1, FZ)).toBe('2026-10-31T23:00:00.000Z');
    expect(ajouterMois('2026-12-15T10:00:00.000Z', 1, FZ)).toBe('2026-12-31T23:00:00.000Z');
  });
  it('liste les lundis qui couvrent octobre 2026', () => {
    const s = semainesDuMois('2026-10-15T10:00:00.000Z', FZ);
    expect(s).toHaveLength(5);
    expect(s[0]).toBe('2026-09-27T22:00:00.000Z');
    expect(s[4]).toBe('2026-10-25T23:00:00.000Z');
  });
});

describe('cleSemaineIso', () => {
  it('donne la semaine ISO locale, y compris en fin d’année', () => {
    expect(cleSemaineIso('2026-09-28T10:00:00.000Z', 'Europe/Paris')).toBe('2026-W40');
    expect(cleSemaineIso('2026-10-04T21:30:00.000Z', 'Europe/Paris')).toBe('2026-W40');
    expect(cleSemaineIso('2026-10-04T22:30:00.000Z', 'Europe/Paris')).toBe('2026-W41');
    expect(cleSemaineIso('2027-01-01T12:00:00.000Z', 'Europe/Paris')).toBe('2026-W53');
    expect(cleSemaineIso('2027-01-04T12:00:00.000Z', 'Europe/Paris')).toBe('2027-W01');
  });
});
