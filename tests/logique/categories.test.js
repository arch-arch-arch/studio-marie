import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { depuisSaisieLocale } from '../../src/logique/dates.js';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import {
  CATEGORIES, categoriesDuProfil, normaliserCategorie, propositionCategorie, categorieAffichee, controlerCategories, nomCategorie,
} from '../../src/logique/categories.js';

const FZ = fictif.regles_studio.fuseau;
const LUNDI = '2026-09-27T22:00:00.000Z';
let n = 0;
const fiche = (format, jour, extra = {}, heure = '12:00') => ({
  ...nouvelleFiche({ id: `c${n++}`, format, date_heure: depuisSaisieLocale(jour, heure, FZ), maintenant: LUNDI }),
  ...extra,
});
const JOURS = ['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04'];
const sansSection = () => { const p = structuredClone(fictif); delete p.categories_de_contenu; return p; };
const avecSection = categories => ({ ...sansSection(), categories_de_contenu: { categories } });
const base = () => fiche('reel', JOURS[0]);

describe('CATEGORIES', () => {
  it('six catégories, clés, noms et couleurs exacts', () => {
    expect(CATEGORIES).toEqual([
      { cle: 'attraction', nom: 'Attraction', couleur: '#d9622b' },
      { cle: 'autorite', nom: 'Autorité', couleur: '#4a5be0' },
      { cle: 'connexion', nom: 'Connexion', couleur: '#0b8574' },
      { cle: 'desir', nom: 'Désir', couleur: '#b3125a' },
      { cle: 'preuve', nom: 'Preuve', couleur: '#a07800' },
      { cle: 'conversion', nom: 'Conversion', couleur: '#7a2fb5' },
    ]);
  });
});

describe('categoriesDuProfil', () => {
  it('sans section : six catégories, couleurs par défaut, cibles null', () => {
    expect(categoriesDuProfil(sansSection())).toEqual(CATEGORIES.map(c => ({ ...c, cible_fil: null, cible_stories: null })));
  });

  it('une catégorie colorée et ciblée : elle seule change', () => {
    const r = categoriesDuProfil(avecSection([{ cle: 'desir', couleur: '#112233', cible_fil: 2, cible_stories: { min: 1, max: 2 } }]));
    expect(r).toEqual(CATEGORIES.map(c => (c.cle === 'desir'
      ? { ...c, couleur: '#112233', cible_fil: 2, cible_stories: { min: 1, max: 2 } }
      : { ...c, cible_fil: null, cible_stories: null })));
  });
});

describe('normaliserCategorie', () => {
  it('tolère casse, accents et espaces', () => {
    expect(normaliserCategorie('Autorité')).toBe('autorite');
    expect(normaliserCategorie(' DÉSIR ')).toBe('desir');
    expect(normaliserCategorie('conversion')).toBe('conversion');
  });

  it('renvoie null pour une valeur inconnue ou non textuelle', () => {
    expect(normaliserCategorie('inconnue')).toBeNull();
    expect(normaliserCategorie('')).toBeNull();
    expect(normaliserCategorie(null)).toBeNull();
    expect(normaliserCategorie(3)).toBeNull();
  });
});

describe('propositionCategorie', () => {
  it('la proposition de l’analyse passe avant les règles', () => {
    expect(propositionCategorie({ ...base(), categorie_proposee: { cle: 'preuve', source: 'analyse' }, porte: true, ragebait: true }))
      .toEqual({ cle: 'preuve', source: 'analyse', raison: 'proposée par l’analyse' });
  });

  it('porte ou cta : conversion', () => {
    const attendu = { cle: 'conversion', source: 'regle', raison: 'règle : mène vers l’offre' };
    expect(propositionCategorie({ ...base(), porte: true })).toEqual(attendu);
    expect(propositionCategorie({ ...base(), cta: true })).toEqual(attendu);
  });

  it('ragebait : attraction, après porte et cta', () => {
    expect(propositionCategorie({ ...base(), ragebait: true }))
      .toEqual({ cle: 'attraction', source: 'regle', raison: 'règle : ragebait' });
    expect(propositionCategorie({ ...base(), ragebait: true, cta: true }).cle).toBe('conversion');
  });

  it('aucune règle : null', () => {
    expect(propositionCategorie(base())).toBeNull();
  });

  it('catégorie choisie : jamais de proposition', () => {
    expect(propositionCategorie({ ...base(), categorie: 'desir', porte: true })).toBeNull();
  });

  it('categorie_proposee invalide ignorée', () => {
    expect(propositionCategorie({ ...base(), categorie_proposee: { cle: 'inconnue', source: 'analyse' }, ragebait: true }).cle).toBe('attraction');
    expect(propositionCategorie({ ...base(), categorie_proposee: { cle: 'preuve', source: 'manuel' } })).toBeNull();
  });
});

describe('categorieAffichee', () => {
  it('fiche ancienne sans champs : non rangée, sans lever', () => {
    const ancienne = { id: 'old', format: 'reel', date_heure: LUNDI };
    expect(categorieAffichee(ancienne)).toEqual({ cle: null, etat: 'non_rangee' });
  });

  it('choisie, proposée ou non rangée', () => {
    expect(categorieAffichee({ ...base(), categorie: 'autorite' })).toEqual({ cle: 'autorite', etat: 'choisie' });
    expect(categorieAffichee({ ...base(), porte: true })).toEqual({ cle: 'conversion', etat: 'proposee', source: 'regle' });
    expect(categorieAffichee({ ...base(), categorie_proposee: { cle: 'preuve', source: 'analyse' } }))
      .toEqual({ cle: 'preuve', etat: 'proposee', source: 'analyse' });
    expect(categorieAffichee(base())).toEqual({ cle: null, etat: 'non_rangee' });
  });
});

describe('controlerCategories', () => {
  const profil = avecSection([
    { cle: 'attraction', cible_fil: 3, cible_stories: null },
    { cle: 'conversion', cible_fil: null, cible_stories: { min: 2, max: 3 } },
  ]);
  const semaine = () => [
    fiche('reel', JOURS[0], { categorie: 'attraction' }),
    fiche('story', JOURS[1], { categorie: 'conversion' }),
    fiche('story', JOURS[2], { categorie: 'conversion' }),
    fiche('reel', JOURS[3], { categorie_proposee: { cle: 'attraction', source: 'analyse' } }),
    fiche('post', JOURS[4]),
    fiche('reel', '2026-10-05', { categorie: 'attraction' }),
  ];

  it('pastilles exactes : cibles, non rangées ; proposée et hors semaine non comptées', () => {
    expect(controlerCategories(semaine(), profil, LUNDI)).toEqual([
      { cle: 'attraction_fil', libelle: 'Attraction', valeur: '1 sur 3 contenus du fil', etat: 'rouge' },
      { cle: 'conversion_stories', libelle: 'Conversion', valeur: '2 stories, objectif 2 à 3', etat: 'vert' },
      { cle: 'non_rangees', libelle: 'Non rangées', valeur: '2', etat: 'orange' },
    ]);
  });

  it('fil : vert à la cible, orange à un d’écart, rouge au-delà', () => {
    const etat = k => controlerCategories(
      Array.from({ length: k }, (_, i) => fiche('reel', JOURS[i], { categorie: 'attraction' })), profil, LUNDI,
    )[0].etat;
    expect([etat(3), etat(2), etat(0)]).toEqual(['vert', 'orange', 'rouge']);
  });

  it('stories : vert entre min et max, orange à un d’écart, rouge au-delà', () => {
    const etat = k => controlerCategories(
      Array.from({ length: k }, (_, i) => fiche('story', JOURS[i], { categorie: 'conversion' })), profil, LUNDI,
    ).find(p => p.cle === 'conversion_stories').etat;
    expect([etat(2), etat(1), etat(4), etat(5), etat(0)]).toEqual(['vert', 'orange', 'orange', 'rouge', 'rouge']);
  });

  it('une catégorie avec les deux cibles donne deux pastilles', () => {
    const p = avecSection([{ cle: 'preuve', cible_fil: 1, cible_stories: { min: 1, max: 1 } }]);
    expect(controlerCategories([], p, LUNDI)).toEqual([
      { cle: 'preuve_fil', libelle: 'Preuve', valeur: '0 sur 1 contenu du fil', etat: 'orange' },
      { cle: 'preuve_stories', libelle: 'Preuve', valeur: '0 story, objectif 1', etat: 'orange' },
    ]);
  });

  it('accord au singulier : « 1 story », « 1 sur 1 contenu du fil », « 0 sur 1 contenu du fil »', () => {
    const p = avecSection([{ cle: 'desir', cible_fil: 1, cible_stories: { min: 1, max: 2 } }]);
    const sortie = controlerCategories([fiche('story', JOURS[0], { categorie: 'desir' }), fiche('reel', JOURS[1], { categorie: 'desir' })], p, LUNDI);
    expect(sortie.map(x => x.valeur)).toEqual(['1 sur 1 contenu du fil', '1 story, objectif 1 à 2']);
    expect(controlerCategories([], p, LUNDI).map(x => x.valeur)).toEqual(['0 sur 1 contenu du fil', '0 story, objectif 1 à 2']);
  });

  it('cible 0 : singulier, « 0 sur 0 contenu du fil »', () => {
    const p = avecSection([{ cle: 'desir', cible_fil: 0 }]);
    expect(controlerCategories([], p, LUNDI)).toEqual([{ cle: 'desir_fil', libelle: 'Désir', valeur: '0 sur 0 contenu du fil', etat: 'vert' }]);
  });

  it('Non rangées garde son libellé et sa valeur', () => {
    const p = avecSection([{ cle: 'desir', cible_fil: 1 }]);
    expect(controlerCategories([fiche('post', JOURS[0]), fiche('post', JOURS[1])], p, LUNDI).at(-1))
      .toEqual({ cle: 'non_rangees', libelle: 'Non rangées', valeur: '2', etat: 'orange' });
  });

  it('profil sans section : []', () => {
    expect(controlerCategories(semaine(), sansSection(), LUNDI)).toEqual([]);
  });

  it('section sans cibles : seule la ligne Non rangées, et seulement s’il y en a', () => {
    const p = avecSection([{ cle: 'desir' }]);
    expect(controlerCategories([fiche('post', JOURS[0])], p, LUNDI))
      .toEqual([{ cle: 'non_rangees', libelle: 'Non rangées', valeur: '1', etat: 'orange' }]);
    expect(controlerCategories([], p, LUNDI)).toEqual([]);
  });
});

describe('nomCategorie', () => {
  it('donne le nom affiché, ou la clé si elle est inconnue', () => {
    expect(nomCategorie('autorite')).toBe('Autorité');
    expect(nomCategorie('inconnue')).toBe('inconnue');
  });
});
