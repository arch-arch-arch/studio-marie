import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { verifierRegles, dansUnCreneau, compterMots } from '../../src/logique/regles-score.js';

const R = fictif.regles_studio;
const LUNDI_MIDI = '2026-09-28T10:00:00.000Z';
const fiche = (extra = {}) => ({
  ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: LUNDI_MIDI, pilier: 'socio', maintenant: 'x' }),
  accroche: 'Tu relis ce message pour la troisième fois.',
  caption: 'Une ligne. Dis-moi en commentaire.',
  hashtags: ['nuit', 'socio', 'humour', 'paris'],
  ...extra,
});

describe('compterMots et dansUnCreneau', () => {
  it('compte les mots et repère les créneaux (fin exclue)', () => {
    expect(compterMots('  un deux   trois ')).toBe(3);
    expect(compterMots('')).toBe(0);
    expect(dansUnCreneau(LUNDI_MIDI, R)).toBe(true);
    expect(dansUnCreneau('2026-09-28T13:00:00.000Z', R)).toBe(false);
    expect(dansUnCreneau('2026-09-30T10:00:00.000Z', R)).toBe(false);
  });
});

describe('verifierRegles', () => {
  it('contenu propre : vert, sans alerte', () => {
    expect(verifierRegles(fiche(), R)).toEqual({
      conformite: { etat: 'vert', causes: [] }, alertes: [], mesures: { motsAccroche: 8, nbHashtags: 4 },
    });
  });

  it('bloque un mot à éviter, sans tenir compte de la casse, jusque dans les hashtags', () => {
    expect(verifierRegles(fiche({ caption: 'Le MINDSET du jour.' }), R).conformite)
      .toEqual({ etat: 'rouge', causes: ['mot à éviter « mindset »'] });
    expect(verifierRegles(fiche({ caption: 'Tout est en link in bio.' }), R).conformite.causes)
      .toEqual(['mot à éviter « link in bio »']);
    expect(verifierRegles(fiche({ hashtags: ['nuit', 'bienveillance', 'paris'] }), R).conformite.causes)
      .toEqual(['mot à éviter « bienveillance »']);
  });

  it('ignore les mots à éviter vides', () => {
    expect(verifierRegles(fiche(), { ...R, mots_a_eviter: ['', '   '] }).conformite.etat).toBe('vert');
  });

  it('bloque un lien dans le texte, sauf pour une story qui mène à la porte', () => {
    const cause = 'lien dans le texte (seule une story qui mène à la porte peut porter un lien)';
    expect(verifierRegles(fiche({ caption: 'Tout est sur https://exemple.test/moi' }), R).conformite.causes).toEqual([cause]);
    expect(verifierRegles(fiche({ caption: 'Va voir exemple.com/x' }), R).conformite.causes).toEqual([cause]);
    expect(verifierRegles(fiche({ format: 'story', porte: true, caption: 'https://exemple.test/moi' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ format: 'story', porte: false, caption: 'https://exemple.test/moi' }), R).conformite.causes).toEqual([cause]);
  });

  it('bloque un géotag plus précis que la ville', () => {
    expect(verifierRegles(fiche({ geotag: 'Paris' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ geotag: '12 rue des Lilas' }), R).conformite.causes)
      .toEqual(['géotag trop précis « 12 rue des Lilas » (reste au niveau de la ville)']);
    expect(verifierRegles(fiche({ geotag: 'Chez moi' }), R).conformite.etat).toBe('rouge');
  });

  it('cumule plusieurs causes', () => {
    expect(verifierRegles(fiche({ caption: 'mindset https://exemple.test', geotag: '3 place X' }), R).conformite.causes).toHaveLength(3);
  });

  it('signale une accroche trop longue ou absente', () => {
    const longue = 'un deux trois quatre cinq six sept huit neuf dix onze douze treize quatorze quinze seize';
    expect(verifierRegles(fiche({ accroche: longue }), R).alertes)
      .toEqual([{ critere: 'accroche', texte: 'Accroche trop longue : 16 mots (15 au maximum).' }]);
    expect(verifierRegles(fiche({ accroche: '' }), R).alertes)
      .toEqual([{ critere: 'accroche', texte: 'Pas d’accroche.' }]);
  });

  it('signale un nombre de hashtags hors de la plage, sauf pour une story', () => {
    expect(verifierRegles(fiche({ hashtags: ['a', 'b'] }), R).alertes)
      .toEqual([{ critere: 'mecanique', texte: '2 hashtag(s) : vise entre 3 et 5.' }]);
    expect(verifierRegles(fiche({ format: 'story', hashtags: [] }), R).alertes).toEqual([]);
  });

  it('signale un contenu du feed hors créneau, pas une story', () => {
    const horsCreneau = { critere: 'accroche', texte: 'Hors des créneaux recommandés du profil.' };
    expect(verifierRegles(fiche({ date_heure: '2026-09-30T10:00:00.000Z' }), R).alertes).toEqual([horsCreneau]);
    expect(verifierRegles(fiche({ date_heure: '2026-09-28T13:00:00.000Z' }), R).alertes).toEqual([horsCreneau]);
    expect(verifierRegles(fiche({ format: 'story', date_heure: '2026-09-30T10:00:00.000Z' }), R).alertes).toEqual([]);
  });

  it('recommande un carrousel pour une photo seule, sans pénalité', () => {
    expect(verifierRegles(fiche({ format: 'post' }), R).alertes)
      .toEqual([{ critere: null, texte: 'Photo seule : le profil recommande un carrousel.' }]);
  });
});
