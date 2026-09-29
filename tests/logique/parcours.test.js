import { describe, it, expect } from 'vitest';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import { libelleJour, heureLocale } from '../../src/logique/dates.js';
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
const action = (f, releves = [], m = M) => prochaineAction(f, releves, m, FZ);

describe('prochaineAction : préparation', () => {
  it('liste ce qui manque pour terminer', () => {
    expect(action(base())).toEqual({ cle: 'terminer', libelle: 'Terminer : ajoute un visuel et une caption', detail: '', retard: false });
    expect(action(base({ visuel: 'a1' })).libelle).toBe('Terminer : ajoute une caption');
    expect(action(base({ caption: 'x' })).libelle).toBe('Terminer : ajoute un visuel');
    expect(action(base({ format: 'story' })).libelle).toBe('Terminer : ajoute un visuel');
  });
  it('demande l’évaluation, puis la réévaluation', () => {
    expect(action(base({ visuel: 'a1', caption: 'x' })).cle).toBe('evaluer');
    expect(action({ ...evaluee(), caption: 'autre' })).toMatchObject({ cle: 'reevaluer', libelle: 'Réévaluer' });
  });
  it('demande de corriger une conformité rouge, avec les causes', () => {
    expect(action(evaluee({}, { etat: 'rouge', causes: ['mot « mindset »', 'lien'] })))
      .toEqual({ cle: 'corriger', libelle: 'Corriger la conformité', detail: 'mot « mindset » ; lien', retard: false });
  });
  it('propose de valider une fiche prête', () => {
    expect(action(evaluee())).toMatchObject({ cle: 'valider', libelle: 'Valider la fiche' });
    expect(action(evaluee({ statut: 'brouillon' })).cle).toBe('valider');
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
  it('une programmation sans date confirmée ou décalée demande une reconfirmation', () => {
    expect(action(evaluee({ statut: 'programme' })).cle).toBe('reconfirmer');
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
