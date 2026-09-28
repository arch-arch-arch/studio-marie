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

  it('ne bloque pas un mot à éviter contenu dans un autre mot', () => {
    expect(verifierRegles(fiche({ ...{}, caption: 'un bon courage' }), { ...R, mots_a_eviter: ['rage'] }).conformite.etat)
      .toBe('vert');
  });

  it('bloque un mot à éviter composé même avec espaces multiples ou retour à la ligne, et son hashtag collé', () => {
    expect(verifierRegles(fiche({ caption: 'Tout est link\nin  bio ici.' }), R).conformite.causes)
      .toEqual(['mot à éviter « link in bio »']);
    expect(verifierRegles(fiche({ hashtags: ['nuit', 'linkinbio', 'paris'] }), R).conformite.causes)
      .toEqual(['mot à éviter « link in bio »']);
  });

  it('bloque un mot à éviter malgré les accents', () => {
    expect(verifierRegles(fiche({ caption: 'Un peu de serenite please' }), { ...R, mots_a_eviter: ['sérénité'] }).conformite.etat)
      .toBe('rouge');
  });

  it('bloque un mot à éviter malgré une apostrophe typographique différente', () => {
    expect(verifierRegles(fiche({ caption: 'Franchement c’est ça la vie.' }), { ...R, mots_a_eviter: ["c'est ça"] }).conformite.etat)
      .toBe('rouge');
  });

  it('bloque un lien dans le texte, sauf pour une story qui mène à la porte', () => {
    const cause = fragment => `lien « ${fragment} » dans le texte (seule une story qui mène à la porte peut porter un lien)`;
    expect(verifierRegles(fiche({ caption: 'Tout est sur https://exemple.test/moi' }), R).conformite.causes)
      .toEqual([cause('https://exemple.test/moi')]);
    expect(verifierRegles(fiche({ caption: 'Va voir exemple.com/x' }), R).conformite.causes)
      .toEqual([cause('exemple.com/x')]);
    expect(verifierRegles(fiche({ format: 'story', porte: true, caption: 'https://exemple.test/moi' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ format: 'story', porte: false, caption: 'https://exemple.test/moi' }), R).conformite.causes)
      .toEqual([cause('https://exemple.test/moi')]);
    // un reel avec porte:true (champ ignoré hors story) reste bloqué
    expect(verifierRegles(fiche({ format: 'reel', porte: true, caption: 'https://exemple.test/moi' }), R).conformite.etat).toBe('rouge');
  });

  it('détecte les domaines de link-in-bio connus et les domaines nus dans une extension sûre', () => {
    expect(verifierRegles(fiche({ caption: 'Mon lien : linktr.ee/moi' }), R).conformite.etat).toBe('rouge');
    expect(verifierRegles(fiche({ caption: 'beacons.ai' }), R).conformite.etat).toBe('rouge');
    expect(verifierRegles(fiche({ caption: 'Va sur moi.xyz' }), R).conformite.etat).toBe('rouge');
    expect(verifierRegles(fiche({ caption: 'www.exemple.fr' }), R).conformite.etat).toBe('rouge');
  });

  it('ne bloque pas une phrase ressemblant à un domaine sans être un lien', () => {
    expect(verifierRegles(fiche({ caption: 'Je rentre vraiment.Me voilà' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ caption: 'On a fini.Co-working demain' }), R).conformite.etat).toBe('vert');
  });

  it('ne bloque pas un domaine de link-in-bio connu caché dans un autre mot', () => {
    expect(verifierRegles(fiche({ caption: 'mon habit.Lyon' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ caption: 'bit.ly/x' }), R).conformite.etat).toBe('rouge');
  });

  it('bloque un géotag plus précis que la ville', () => {
    expect(verifierRegles(fiche({ geotag: 'Paris' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ geotag: '12 rue des Lilas' }), R).conformite.causes)
      .toEqual(['géotag trop précis « 12 rue des Lilas » (reste au niveau de la ville)']);
    expect(verifierRegles(fiche({ geotag: 'Chez moi' }), R).conformite.etat).toBe('rouge');
  });

  it('détecte les types de voie et les codes postaux, mais pas un chiffre seul', () => {
    expect(verifierRegles(fiche({ geotag: '12 av. Foch' }), R).conformite.etat).toBe('rouge');
    expect(verifierRegles(fiche({ geotag: 'Quai de Valmy' }), R).conformite.etat).toBe('rouge');
    expect(verifierRegles(fiche({ geotag: '75011 Paris' }), R).conformite.etat).toBe('rouge');
    expect(verifierRegles(fiche({ geotag: '3 bis, rue X' }), R).conformite.etat).toBe('rouge');
    expect(verifierRegles(fiche({ geotag: 'Paris 11e' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ geotag: 'Lyon' }), R).conformite.etat).toBe('vert');
  });

  it('ne remonte pas un numéro isolé d’un type de voie comme un numéro de voie', () => {
    expect(verifierRegles(fiche({ geotag: 'Festival 2024 Avignon' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ geotag: 'Paris 3 Villages' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ geotag: 'Bordeaux 33 Bdx' }), R).conformite.etat).toBe('vert');
    expect(verifierRegles(fiche({ geotag: '12 av. Foch' }), R).conformite.etat).toBe('rouge');
    expect(verifierRegles(fiche({ geotag: '3 bis, rue X' }), R).conformite.etat).toBe('rouge');
  });

  it('reste rapide sur un géotag pensé pour faire reculer le moteur de regex', () => {
    const geotag = '1' + ' '.repeat(5000) + 'x';
    const debut = performance.now();
    verifierRegles(fiche({ geotag }), R);
    expect(performance.now() - debut).toBeLessThan(50);
  });

  it('détecte un géotag sans accent, insensible à la casse, après normalisation', () => {
    expect(verifierRegles(fiche({ geotag: 'Allee des Pins' }), R).conformite.etat).toBe('rouge');
    expect(verifierRegles(fiche({ geotag: 'Residence les Tilleuls' }), R).conformite.etat).toBe('rouge');
    expect(verifierRegles(fiche({ geotag: 'Cite U' }), R).conformite.etat).toBe('rouge');
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
