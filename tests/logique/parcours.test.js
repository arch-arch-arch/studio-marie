import { describe, it, expect } from 'vitest';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import { libelleJour, heureLocale } from '../../src/logique/dates.js';
import fictif from '../../exemples/profil-fictif.json';
import { prochaineAction, ACTIONS_SANS_SUITE } from '../../src/logique/parcours.js';

const FZ = 'Europe/Paris';
const M = '2026-09-29T10:00:00.000Z';
const D = '2026-10-01T10:00:00.000Z';
const base = extra => ({ ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: D, pilier: 'socio', maintenant: '2026-09-27T20:00:00.000Z' }), ...extra });
const evaluee = (extra = {}, conformite = { etat: 'vert', causes: [] }) => {
  const f = base({ visuel: 'a1', visuel_type: 'image', caption: 'Une caption.', ...extra });
  return { ...f, score: { total: 70, criteres: [], conformite, empreinte: empreinte(f) } };
};
const quand = iso => `${libelleJour(iso, FZ)} à ${heureLocale(iso, FZ)}`;
const R = fictif.regles_studio;
const action = (f, releves = [], m = M) => prochaineAction(f, releves, m, FZ, R);

describe('prochaineAction : préparation', () => {
  it('propose de valider même sans visuel ni caption, avec les manques en détail', () => {
    expect(action(base())).toEqual({ cle: 'valider', libelle: 'Valider la fiche', detail: 'Pas de visuel ; Pas de caption ; Pas encore analysée', retard: false });
    expect(action(base({ visuel: 'a1' })).detail).toBe('Pas de caption ; Pas encore analysée');
    expect(action(base({ caption: 'x' })).detail).toBe('Pas de visuel ; Pas encore analysée');
    expect(action(base({ format: 'story' })).detail).toBe('Pas de visuel ; Pas encore analysée');
  });
  it('ne demande plus d’évaluation : une analyse dépassée se lit en détail', () => {
    expect(action(base({ visuel: 'a1', caption: 'x' })).cle).toBe('valider');
    expect(action({ ...evaluee(), caption: 'autre' })).toMatchObject({ cle: 'valider', libelle: 'Valider la fiche', detail: 'Analyse dépassée : la fiche a changé depuis' });
  });
  it('propose de valider une fiche au rouge, avec la cause en détail', () => {
    expect(action(evaluee({ caption: 'Le mindset du jour.' })))
      .toEqual({ cle: 'valider', libelle: 'Valider la fiche', detail: 'mot à éviter « mindset »', retard: false });
  });
  it('propose de valider une fiche prête', () => {
    expect(action(evaluee())).toMatchObject({ cle: 'valider', libelle: 'Valider la fiche' });
    expect(action(evaluee({ statut: 'brouillon' })).cle).toBe('valider');
  });
  it('propose de valider même si la conformité du score n’est pas évaluée', () => {
    expect(action(evaluee({}, { etat: undefined, causes: [] })).cle).toBe('valider');
  });
  it('signale le retard quand la date prévue est passée', () => {
    expect(action(base({ date_heure: '2026-09-28T10:00:00.000Z' })).retard).toBe(true);
  });
});

describe('prochaineAction : programmation et publication', () => {
  it('une fiche validée attend sa programmation', () => {
    expect(action(evaluee({ statut: 'valide' }))).toEqual({ cle: 'programmer', libelle: 'Confirmer la programmation', detail: '', retard: false });
    expect(action(evaluee({ statut: 'valide', date_heure: '2026-09-28T10:00:00.000Z' })).retard).toBe(true);
  });
  it('une programmation sans date confirmée demande une reconfirmation, avec le détail adapté', () => {
    expect(action(evaluee({ statut: 'programme' })))
      .toEqual({ cle: 'reconfirmer', libelle: 'Reconfirmer la programmation', detail: 'Confirme la date programmée dans Meta Business Suite.', retard: false });
  });
  it('une programmation décalée demande une reconfirmation', () => {
    expect(action(evaluee({ statut: 'programme', programme_pour: '2026-09-30T10:00:00.000Z' })))
      .toEqual({ cle: 'reconfirmer', libelle: 'Reconfirmer la programmation', detail: 'La date a changé depuis la confirmation.', retard: false });
  });
  it('une programmation à venir n’appelle aucune action', () => {
    const a = action(evaluee({ statut: 'programme', programme_pour: D }));
    expect(a).toEqual({ cle: 'attendre', libelle: `Programmé pour le ${quand(D)}`, detail: '', retard: false });
    expect(ACTIONS_SANS_SUITE.has(a.cle)).toBe(true);
  });
  it('après l’heure prévue, il faut confirmer la publication ; en retard après 24 h', () => {
    const f = evaluee({ statut: 'programme', programme_pour: D, date_heure: D });
    expect(action(f, [], '2026-10-01T12:00:00.000Z')).toEqual({ cle: 'publier', libelle: 'Confirmer la publication', detail: '', retard: false });
    expect(action(f, [], '2026-10-02T10:00:01.000Z').retard).toBe(true);
  });
  it('une date passée l’emporte sur la reconfirmation, même sans programme_pour ou avec une date décalée', () => {
    expect(action(evaluee({ statut: 'programme', date_heure: '2026-09-29T09:00:00.000Z' })))
      .toEqual({ cle: 'publier', libelle: 'Confirmer la publication', detail: '', retard: false });
    expect(action(evaluee({ statut: 'programme', date_heure: '2026-09-28T04:00:00.000Z' })).retard).toBe(true);
    expect(action(evaluee({ statut: 'programme', programme_pour: '2026-09-30T10:00:00.000Z', date_heure: '2026-09-29T09:00:00.000Z' })).cle)
      .toBe('publier');
  });
});

describe('prochaineAction : statistiques', () => {
  const pub = (publie_le, extra = {}) => evaluee({ statut: 'publie', publie_le, date_heure: publie_le, ...extra });
  it('demande les relevés dus, en retard', () => {
    expect(action(pub('2026-09-27T10:00:00.000Z'))).toEqual({ cle: 'stats', libelle: 'Saisir les stats à 48 h', detail: '', retard: true });
    expect(action(pub('2026-09-20T10:00:00.000Z')).libelle).toBe('Saisir les stats à 48 h et à 7 jours');
    expect(action(pub('2026-09-20T10:00:00.000Z'), [{ releve: '48h' }]).libelle).toBe('Saisir les stats à 7 jours');
  });
  it('annonce le prochain relevé quand rien n’est dû', () => {
    expect(action(pub('2026-09-29T09:00:00.000Z'))).toEqual({ cle: 'attendre', libelle: `Prochain relevé le ${quand('2026-10-01T09:00:00.000Z')}`, detail: '', retard: false });
    expect(action(pub('2026-09-27T10:00:00.000Z'), [{ releve: '48h' }]).libelle).toBe(`Prochain relevé le ${quand('2026-10-04T10:00:00.000Z')}`);
  });
  it('termine quand les deux relevés sont saisis', () => {
    expect(action(pub('2026-09-20T10:00:00.000Z'), [{ releve: '48h' }, { releve: '7j' }])).toEqual({ cle: 'termine', libelle: 'Terminé', detail: '', retard: false });
  });
  it('une fiche publiée avant le plan 5 (sans publie_le) part de date_heure', () => {
    expect(action(evaluee({ statut: 'publie', date_heure: '2026-09-27T10:00:00.000Z' })).libelle).toBe('Saisir les stats à 48 h');
  });
});
