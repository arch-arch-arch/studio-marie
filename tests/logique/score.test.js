import { describe, it, expect } from 'vitest';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import { composerScore, fusionnerConformite, POIDS, PLAFOND_ROUGE } from '../../src/logique/score.js';

const VERT = { etat: 'vert', causes: [] };
const f = (format = 'reel') => ({ ...nouvelleFiche({ id: 'f1', format, date_heure: '2026-09-28T10:00:00.000Z', maintenant: 'x' }), caption: 'c', visuel: 'a1' });
const jugement = (notes, conformite = VERT) => ({ notes, phrases: { accroche: 'A.', voix: 'V.', mecanique: 'M.' }, conformite });
const verif = (alertes = [], conformite = VERT) => ({ conformite, alertes, mesures: {} });
const composer = (fiche, v, j) => composerScore({ fiche, verification: v, jugement: j, versionProfil: 3, maintenant: 'T' });
const dix = { accroche: 10, voix: 10, mecanique: 10 };

describe('composerScore', () => {
  it('reel parfait : 100, poids 40/30/30', () => {
    const fiche = f('reel');
    expect(composer(fiche, verif(), jugement(dix))).toEqual({
      total: 100,
      criteres: [
        { cle: 'accroche', nom: 'Accroche et diffusion', points: 40, max: 40, phrase: 'A.' },
        { cle: 'voix', nom: 'Voix et esthétique', points: 30, max: 30, phrase: 'V.' },
        { cle: 'mecanique', nom: 'Mécanique de la caption', points: 30, max: 30, phrase: 'M.' },
      ],
      conformite: VERT, alertes: [], version_profil: 3, evalue_le: 'T', empreinte: empreinte(fiche),
    });
  });

  it('applique les poids de la story et du post (grille du carrousel)', () => {
    expect(composer(f('story'), verif(), jugement({ accroche: 5, voix: 5, mecanique: 5 })).total).toBe(50);
    expect(composer(f('post'), verif(), jugement(dix)).criteres.map(c => c.max)).toEqual([30, 35, 35]);
    expect(POIDS.carrousel).toEqual({ accroche: 30, voix: 35, mecanique: 35 });
  });

  it('retire 20 % du maximum du critère par alerte, jamais sous zéro', () => {
    const accroche = { critere: 'accroche', texte: 'x' };
    expect(composer(f('reel'), verif([accroche]), jugement(dix)).total).toBe(92);
    const deux = [{ critere: 'mecanique', texte: 'a' }, { critere: 'mecanique', texte: 'b' }];
    expect(composer(f('carrousel'), verif(deux), jugement({ accroche: 0, voix: 0, mecanique: 5 })).criteres[2].points).toBe(4);
    expect(composer(f('carrousel'), verif([...deux, ...deux]), jugement({ accroche: 0, voix: 0, mecanique: 1 })).criteres[2].points).toBe(0);
  });

  it('une alerte sans critère ne pénalise pas mais reste listée', () => {
    const s = composer(f('post'), verif([{ critere: null, texte: 'Photo seule.' }]), jugement(dix));
    expect(s.total).toBe(100);
    expect(s.alertes).toEqual(['Photo seule.']);
  });

  it('borne les notes entre 0 et 10', () => {
    expect(composer(f('reel'), verif(), jugement({ accroche: 12, voix: -3, mecanique: 'x' })).criteres.map(c => c.points)).toEqual([40, 0, 0]);
  });

  it('Claude ne peut pas lever un rouge calculé : plafond à 40', () => {
    const s = composer(f('reel'), verif([], { etat: 'rouge', causes: ['mot à éviter « mindset »'] }), jugement(dix));
    expect(s.conformite).toEqual({ etat: 'rouge', causes: ['mot à éviter « mindset »'] });
    expect(s.total).toBe(PLAFOND_ROUGE);
  });

  it('un rouge jugé par Claude bloque aussi ; un orange est gardé sans plafond', () => {
    const rouge = composer(f('reel'), verif(), jugement(dix, { etat: 'rouge', causes: ['groupe visé'] }));
    expect(rouge.conformite).toEqual({ etat: 'rouge', causes: ['groupe visé'] });
    expect(rouge.total).toBe(40);
    const orange = composer(f('reel'), verif(), jugement(dix, { etat: 'orange', causes: ['ambigu'] }));
    expect(orange.conformite).toEqual({ etat: 'orange', causes: ['ambigu'] });
    expect(orange.total).toBe(100);
  });
});

describe('fusionnerConformite', () => {
  it('garde la plus sévère et dédoublonne les causes', () => {
    expect(fusionnerConformite({ etat: 'rouge', causes: ['a'] }, { etat: 'orange', causes: ['a', 'b'] }))
      .toEqual({ etat: 'rouge', causes: ['a', 'b'] });
    expect(fusionnerConformite(VERT, VERT)).toEqual(VERT);
    expect(fusionnerConformite(VERT, { etat: 'inconnu', causes: [] }).etat).toBe('orange');
  });

  it('traite un état calculé inconnu comme rouge : le verrou reste fermé par défaut', () => {
    expect(fusionnerConformite({ etat: 'bizarre', causes: [] }, { etat: 'vert', causes: [] }).etat).toBe('rouge');
  });
});
