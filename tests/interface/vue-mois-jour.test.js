// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { vueMois } from '../../src/interface/vue-mois.js';
import { vueJour } from '../../src/interface/vue-jour.js';
import { creerCacheVisuels } from '../../src/interface/vue-apercu.js';

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
    expect([...premierOctobre.querySelectorAll('.vignette')].map(p => p.querySelector('.vignette-lettre').textContent)).toEqual(['R', 'S']);
    premierOctobre.click();
    expect(actions.changerVue).toHaveBeenCalledWith('jour', '2026-09-30T22:00:00.000Z');
  });
});

describe('couleurs de catégorie (Mois)', () => {
  it('chaque point prend la couleur de sa catégorie choisie ; proposition ou rien : neutre', () => {
    const el = vueMois({
      profil: fictif,
      fiches: [{ ...f('a', 'reel', '2026-10-01T10:00:00.000Z'), categorie: 'desir' }, { ...f('b', 'story', '2026-10-01T17:00:00.000Z'), cta: true }],
      ancre: '2026-10-15T10:00:00.000Z',
    }, actionsFactices());
    const points = el.querySelectorAll('.mois-jour')[3].querySelectorAll('.vignette');
    expect([...points].map(p => p.style.getPropertyValue('--categorie'))).toEqual(['#b3125a', 'var(--texte-2)']);
  });

  it('un point non rangé porte la couleur neutre marquée, pas le gris du bord des cartes', () => {
    const el = vueMois({ profil: fictif, fiches: [f('a', 'post', '2026-10-01T10:00:00.000Z')], ancre: '2026-10-15T10:00:00.000Z' }, actionsFactices());
    expect(el.querySelector('.vignette').style.getPropertyValue('--categorie')).toBe('var(--texte-2)');
  });

  it('chaque point porte la lettre de son format, en lecture seule pour les lecteurs d’écran', () => {
    const el = vueMois({
      profil: fictif,
      fiches: [f('a', 'reel', '2026-10-01T10:00:00.000Z'), f('b', 'carrousel', '2026-10-01T11:00:00.000Z'), f('c', 'story', '2026-10-01T12:00:00.000Z'), f('d', 'post', '2026-10-01T13:00:00.000Z')],
      ancre: '2026-10-15T10:00:00.000Z',
    }, actionsFactices());
    const points = [...el.querySelectorAll('.mois-jour')[3].querySelectorAll('.vignette')];
    // Trois vignettes au plus : la quatrième fiche du jour devient « +1 ».
    expect(points.map(p => p.querySelector('.vignette-lettre').textContent)).toEqual(['R', 'C', 'S']);
    expect(el.querySelectorAll('.mois-jour')[3].querySelector('.vignette-plus').textContent).toBe('+1');
    expect(points[0].querySelector('.vignette-lettre').getAttribute('aria-hidden')).toBe('true');
  });

  it('la case du jour cite les formats distincts', () => {
    const el = vueMois({
      profil: fictif,
      fiches: [f('a', 'reel', '2026-10-01T10:00:00.000Z'), f('b', 'story', '2026-10-01T17:00:00.000Z'), f('c', 'reel', '2026-10-01T18:00:00.000Z')],
      ancre: '2026-10-15T10:00:00.000Z',
    }, actionsFactices());
    expect(el.querySelectorAll('.mois-jour')[3].getAttribute('aria-label')).toBe('jeudi 1 octobre, 3 contenus : Reel, Story');
  });

  it('une couleur de catégorie personnalisée par le profil s’applique au point', () => {
    const perso = structuredClone(fictif);
    perso.categories_de_contenu.categories = [{ cle: 'attraction', couleur: '#123456' }];
    const el = vueMois({ profil: perso, fiches: [{ ...f('a', 'reel', '2026-10-01T10:00:00.000Z'), categorie: 'attraction' }], ancre: '2026-10-15T10:00:00.000Z' }, actionsFactices());
    expect(el.querySelector('.vignette').style.getPropertyValue('--categorie')).toBe('#123456');
  });
});

describe('vueJour', () => {
  it('la carte prend la couleur de catégorie du profil, y compris personnalisée', () => {
    const perso = structuredClone(fictif);
    perso.categories_de_contenu.categories = [{ cle: 'desir', couleur: '#112233' }];
    const el = vueJour({ profil: perso, fiches: [{ ...f('a', 'reel', '2026-09-28T10:00:00.000Z'), categorie: 'desir' }], ancre: '2026-09-28T08:00:00.000Z' }, actionsFactices());
    expect(el.querySelector('.carte').style.getPropertyValue('--categorie')).toBe('#112233');
  });

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
  it('désactive les boutons tant qu’un panneau d’analyse est ouvert', () => {
    expect(bouton(vueMois(etat({ analyse: { etape: 'preparation' } }), actionsFactices(), { dossier: true })).disabled).toBe(true);
    expect(bouton(vueMois(etat({ analyse: { etape: 'pret' } }), actionsFactices(), { dossier: true })).disabled).toBe(true);
    expect([...vueMois(etat({ analyse: { etape: 'retour' } }), actionsFactices(), { dossier: true }).querySelectorAll('button')].find(x => x.textContent === 'Coller un retour').disabled).toBe(true);
  });
  it('affiche l’avis du mois', () => {
    const analyses = [{ id: 'D-1', periode: { type: 'mois', cle: '2026-10' }, assistant: 'claude', fiches: [], retour: { recu_le: '2026-10-10T10:00:00.000Z', avis: 'Bon mois', points_forts: [], risques: [], ordre_conseille: [] } }];
    const el = vueMois(etat({ analyses }), actionsFactices(), { dossier: true });
    expect(el.querySelector('summary').textContent).toBe('Avis sur le mois');
  });
});

describe('coller un retour (Mois)', () => {
  it('propose « Coller un retour » avec la capacité, sans elle non', () => {
    const a = { ...actionsFactices(), ouvrirAnalyse: vi.fn(), ouvrirRetour: vi.fn() };
    const trouver = el => [...el.querySelectorAll('button')].find(x => x.textContent === 'Coller un retour');
    const b = trouver(vueMois({ profil: fictif, fiches: [], ancre: '2026-10-15T10:00:00.000Z' }, a, { dossier: true }));
    expect(b.className).toBe('bouton-secondaire');
    b.click();
    expect(a.ouvrirRetour).toHaveBeenCalled();
    expect(trouver(vueMois({ profil: fictif, fiches: [], ancre: '2026-10-15T10:00:00.000Z' }, a, {}))).toBeUndefined();
  });
});

describe('vueMois : vignettes, formats et visuels', () => {
  const ancre = '2026-10-15T10:00:00.000Z';
  const TOUS = { story: true, reel: true, post: true };
  const avecUrls = () => ({ ...actionsFactices(), urlVisuel: vi.fn(async id => `https://stockage.test/${id}`) });
  const jour = el => el.querySelectorAll('.mois-jour')[3];
  const vignettes = el => [...jour(el).querySelectorAll('.vignette')];
  const etat = (fiches, apercu, extra = {}) => ({ profil: fictif, fiches, ancre, apercu, ...extra });

  it('affiche au plus trois vignettes par jour, puis « +N » pour le reste', () => {
    const fiches = [10, 11, 12, 13, 14].map((h, i) => f(`f${i}`, 'reel', `2026-10-01T${h}:00:00.000Z`));
    const el = vueMois(etat(fiches), actionsFactices());
    expect(vignettes(el)).toHaveLength(3);
    expect(jour(el).querySelector('.vignette-plus').textContent).toBe('+2');
  });

  it('pas de « +N » quand il y a trois fiches ou moins', () => {
    const el = vueMois(etat([f('a', 'reel', '2026-10-01T10:00:00.000Z'), f('b', 'post', '2026-10-01T11:00:00.000Z')]), actionsFactices());
    expect(vignettes(el)).toHaveLength(2);
    expect(jour(el).querySelector('.vignette-plus')).toBeNull();
  });

  it('une fiche avec visuel donne une vignette avec l’image, sans lettre, et demande le lien', async () => {
    const actions = avecUrls();
    const el = vueMois(etat([{ ...f('a', 'post', '2026-10-01T10:00:00.000Z'), visuel: 'a.png', visuel_type: 'image' }]), actions);
    const v = vignettes(el)[0];
    expect(v.querySelector('img')).not.toBeNull();
    expect(v.querySelector('.vignette-lettre')).toBeNull();
    expect(actions.urlVisuel).toHaveBeenCalledWith('a.png');
    await vi.waitFor(() => expect(v.querySelector('img').getAttribute('src')).toBe('https://stockage.test/a.png'));
  });

  it('une vignette vidéo montre une vidéo muette', () => {
    const el = vueMois(etat([{ ...f('v', 'reel', '2026-10-01T10:00:00.000Z'), visuel: 'v.mp4', visuel_type: 'video' }]), avecUrls());
    expect(vignettes(el)[0].querySelector('video').hasAttribute('muted')).toBe(true);
  });

  it('le filtre masque les fiches de la case, et le nom accessible ne compte que les fiches affichées', () => {
    const fiches = [f('r', 'reel', '2026-10-01T10:00:00.000Z'), f('s', 'story', '2026-10-01T11:00:00.000Z')];
    const el = vueMois(etat(fiches, { periode: 'semaine', filtres: { story: false, reel: true, post: true } }), actionsFactices());
    expect(vignettes(el)).toHaveLength(1);
    expect(jour(el).getAttribute('aria-label')).toBe('jeudi 1 octobre, 1 contenu : Reel');
  });

  it('la vignette sans visuel prend la couleur de la catégorie choisie et reste hors de tout bouton', () => {
    const el = vueMois(etat([{ ...f('a', 'reel', '2026-10-01T10:00:00.000Z'), categorie: 'desir' }]), actionsFactices());
    const v = vignettes(el)[0];
    expect(v.tagName).toBe('SPAN');
    expect(v.style.getPropertyValue('--categorie')).toBe('#b3125a');
    expect(jour(el).querySelectorAll('button')).toHaveLength(0);
  });

  it('la barre de formats est en haut de la vue, et son filtre s’applique à la case', () => {
    const actions = { ...actionsFactices(), changerFiltresApercu: vi.fn() };
    const el = vueMois(etat([f('s', 'story', '2026-10-01T10:00:00.000Z')], { periode: 'semaine', filtres: { story: false, reel: true, post: true } }), actions);
    expect(el.firstElementChild.classList.contains('barre-formats')).toBe(true);
    expect(el.querySelector('input[data-commande="format:story"]').checked).toBe(false);
    expect(vignettes(el)).toHaveLength(0);
  });

  it('réutilise le même nœud image quand la vue est reconstruite après une frappe', () => {
    const cache = creerCacheVisuels();
    const actions = avecUrls();
    const fiche = { ...f('a', 'post', '2026-10-01T10:00:00.000Z'), visuel: 'a.png', visuel_type: 'image' };
    const premiere = vueMois(etat([fiche], undefined, { cacheVisuels: cache }), actions);
    const img = premiere.querySelector('img');
    const seconde = vueMois(etat([{ ...fiche, accroche: 'frappée' }], undefined, { cacheVisuels: cache }), actions);
    expect(seconde.querySelector('img')).toBe(img);
    expect(actions.urlVisuel).toHaveBeenCalledTimes(1);
  });
});

describe('vueJour : formats et visuels', () => {
  const ancre = '2026-09-28T08:00:00.000Z';
  const avecUrls = () => ({ ...actionsFactices(), urlVisuel: vi.fn(async id => `https://stockage.test/${id}`) });

  it('n’affiche que les formats cochés, et la barre est en haut de la vue', () => {
    const actions = { ...actionsFactices(), changerFiltresApercu: vi.fn() };
    const el = vueJour({
      profil: fictif,
      fiches: [f('r', 'reel', '2026-09-28T10:00:00.000Z'), f('s', 'story', '2026-09-28T17:00:00.000Z')],
      ancre,
      apercu: { periode: 'semaine', filtres: { story: false, reel: true, post: true } },
    }, actions);
    expect(el.firstElementChild.classList.contains('barre-formats')).toBe(true);
    expect([...el.querySelectorAll('.frise-heure')].map(x => x.textContent)).toEqual(['12:00']);
  });

  it('la carte affiche le visuel de la fiche et demande son lien', async () => {
    const actions = avecUrls();
    const el = vueJour({ profil: fictif, fiches: [{ ...f('a', 'reel', '2026-09-28T10:00:00.000Z'), visuel: 'a.png', visuel_type: 'image' }], ancre }, actions);
    const img = el.querySelector('.carte .carte-visuel img');
    expect(img).not.toBeNull();
    expect(actions.urlVisuel).toHaveBeenCalledWith('a.png');
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('https://stockage.test/a.png'));
  });
});
