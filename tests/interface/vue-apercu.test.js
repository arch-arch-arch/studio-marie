// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { vueApercu, filtrerApercu, creerCacheVisuels } from '../../src/interface/vue-apercu.js';
import { creerRendu } from '../../src/interface/rendu.js';

// Jeudi 15 octobre 2026 à Paris ; la semaine va du lundi 12 à 00:00 (Paris) au lundi 19 à 00:00 (Paris).
const ANCRE = '2026-10-15T10:00:00.000Z';
const DEBUT_SEMAINE = '2026-10-11T22:00:00.000Z';
const FIN_SEMAINE = '2026-10-18T22:00:00.000Z';
const PERIODE = { periode: 'semaine', debut: DEBUT_SEMAINE, fin: FIN_SEMAINE };
const TOUS = { story: true, reel: true, post: true };
const PROFIL = {
  ...fictif,
  categories_de_contenu: { categories: [{ cle: 'attraction', couleur: '#112233' }, { cle: 'conversion', couleur: '#445566' }] },
};

const f = (id, format, date_heure, extra = {}) => ({ ...nouvelleFiche({ id, format, date_heure, pilier: 'socio', maintenant: 'x' }), ...extra });
const ids = liste => liste.map(x => x.id);
const actionsFactices = (extra = {}) => ({
  changerPeriodeApercu: vi.fn(), changerFiltresApercu: vi.fn(), ouvrirFiche: vi.fn(),
  urlVisuel: vi.fn(async id => `https://stockage.test/${id}`), ...extra,
});
const etatApercu = (fiches, apercu = { periode: 'semaine', filtres: TOUS }, extra = {}) => ({ profil: PROFIL, fiches, ancre: ANCRE, apercu, ...extra });
const tuiles = el => [...el.querySelectorAll('button.miniature')];
const commande = (el, texte) => [...el.querySelectorAll('label')].find(l => l.textContent.trim() === texte)?.querySelector('input');

describe('filtrerApercu', () => {
  it('trie par date de publication, et une fiche publiée se place à sa date de publication', () => {
    const a = f('a', 'reel', '2026-10-14T10:00:00.000Z');
    const b = f('b', 'post', '2026-10-19T10:00:00.000Z', { statut: 'publie', publie_le: '2026-10-12T09:00:00.000Z' });
    expect(ids(filtrerApercu([a, b], PERIODE, TOUS))).toEqual(['b', 'a']);
  });

  it('garde les fiches publiées de la période et exclut celles d’avant ou de la fin (exclue)', () => {
    const hors = [f('avant', 'reel', '2026-10-11T21:59:00.000Z'), f('fin', 'reel', '2026-10-18T22:00:00.000Z')];
    const dedans = f('debut', 'reel', '2026-10-11T22:00:00.000Z');
    expect(ids(filtrerApercu([...hors, dedans], PERIODE, TOUS))).toEqual(['debut']);
  });

  it('filtre sur les stories seules, les reels seuls, puis les posts seuls (carrousel et post)', () => {
    const fiches = [
      f('s', 'story', '2026-10-12T10:00:00.000Z'),
      f('r', 'reel', '2026-10-13T10:00:00.000Z'),
      f('c', 'carrousel', '2026-10-14T10:00:00.000Z'),
      f('p', 'post', '2026-10-15T10:00:00.000Z'),
    ];
    expect(ids(filtrerApercu(fiches, PERIODE, { story: true, reel: false, post: false }))).toEqual(['s']);
    expect(ids(filtrerApercu(fiches, PERIODE, { story: false, reel: true, post: false }))).toEqual(['r']);
    expect(ids(filtrerApercu(fiches, PERIODE, { story: false, reel: false, post: true }))).toEqual(['c', 'p']);
  });

  it('aucun format coché ne garde rien ; à date égale, l’ordre suit l’identifiant', () => {
    const memeInstant = '2026-10-12T10:00:00.000Z';
    expect(filtrerApercu([f('a', 'reel', memeInstant)], PERIODE, { story: false, reel: false, post: false })).toEqual([]);
    expect(ids(filtrerApercu([f('z', 'reel', memeInstant), f('m', 'reel', memeInstant)], PERIODE, TOUS))).toEqual(['m', 'z']);
  });
});

describe('vueApercu : commandes', () => {
  it('propose Semaine et Mois, et la période choisie est cochée', () => {
    const actions = actionsFactices();
    const el = vueApercu(etatApercu([], { periode: 'mois', filtres: TOUS }), actions);
    const semaine = el.querySelector('input[type="radio"][value="semaine"]');
    const mois = el.querySelector('input[type="radio"][value="mois"]');
    expect(semaine.checked).toBe(false);
    expect(mois.checked).toBe(true);
    expect(el.querySelector('label:has(input[value="semaine"])').textContent.trim()).toBe('Semaine');
    semaine.dispatchEvent(new Event('change'));
    expect(actions.changerPeriodeApercu).toHaveBeenCalledWith('semaine');
  });

  it('une case par format et « Tout » qui coche ou décoche les trois', () => {
    const actions = actionsFactices();
    const el = vueApercu(etatApercu([], { periode: 'semaine', filtres: { story: true, reel: false, post: true } }), actions);
    expect(commande(el, 'Tout').checked).toBe(false);
    expect(commande(el, 'Stories').checked).toBe(true);
    commande(el, 'Reels').checked = true;
    commande(el, 'Reels').dispatchEvent(new Event('change'));
    expect(actions.changerFiltresApercu).toHaveBeenLastCalledWith({ story: true, reel: true, post: true });
    commande(el, 'Tout').checked = true;
    commande(el, 'Tout').dispatchEvent(new Event('change'));
    expect(actions.changerFiltresApercu).toHaveBeenLastCalledWith({ story: true, reel: true, post: true });
  });

  it('« Tout » décoche les trois quand elles sont toutes cochées', () => {
    const actions = actionsFactices();
    const el = vueApercu(etatApercu([], { periode: 'semaine', filtres: TOUS }), actions);
    expect(commande(el, 'Tout').checked).toBe(true);
    commande(el, 'Tout').checked = false;
    commande(el, 'Tout').dispatchEvent(new Event('change'));
    expect(actions.changerFiltresApercu).toHaveBeenLastCalledWith({ story: false, reel: false, post: false });
  });

  it('aucune case cochée affiche « Coche au moins un format. »', () => {
    const el = vueApercu(etatApercu([f('a', 'reel', '2026-10-12T10:00:00.000Z')], { periode: 'semaine', filtres: { story: false, reel: false, post: false } }), actionsFactices());
    expect(el.textContent).toContain('Coche au moins un format.');
    expect(tuiles(el)).toHaveLength(0);
  });

  it('une période vide affiche « Rien de prévu sur cette période. »', () => {
    const el = vueApercu(etatApercu([f('loin', 'reel', '2026-11-20T10:00:00.000Z')]), actionsFactices());
    expect(el.textContent).toContain('Rien de prévu sur cette période.');
    expect(tuiles(el)).toHaveLength(0);
  });
});

describe('vueApercu : miniatures', () => {
  it('porte la couleur de la catégorie choisie, neutre si non rangée, la date courte, le format et « Publié »', () => {
    const el = vueApercu(etatApercu([
      f('a', 'reel', '2026-10-12T10:00:00.000Z', { categorie: 'attraction' }),
      f('b', 'story', '2026-10-13T10:00:00.000Z'),
      f('c', 'post', '2026-10-14T10:00:00.000Z', { statut: 'publie', publie_le: '2026-10-14T10:00:00.000Z', categorie: 'conversion' }),
    ]), actionsFactices());
    const [a, b, c] = tuiles(el);
    expect(a.style.getPropertyValue('--categorie')).toBe('#112233');
    expect(b.style.getPropertyValue('--categorie')).toBe('var(--trait)');
    expect(c.style.getPropertyValue('--categorie')).toBe('#445566');
    expect(a.textContent).toContain('lun. 12/10');
    expect(a.textContent).toContain('Reel');
    expect(c.textContent).toContain('Publié');
    expect(a.textContent).not.toContain('Publié');
  });

  it('un visuel image est une img chargée à la demande, un visuel vidéo une vidéo muette avec une marque de lecture', async () => {
    const el = vueApercu(etatApercu([
      f('img', 'post', '2026-10-12T10:00:00.000Z', { visuel: 'a.png', visuel_type: 'image' }),
      f('vid', 'reel', '2026-10-13T10:00:00.000Z', { visuel: 'b.mp4', visuel_type: 'video' }),
    ]), actionsFactices());
    const [image, video] = tuiles(el);
    const img = image.querySelector('img');
    expect(img.getAttribute('loading')).toBe('lazy');
    const v = video.querySelector('video');
    expect(v.hasAttribute('muted')).toBe(true);
    expect(v.getAttribute('preload')).toBe('metadata');
    expect(v.hasAttribute('playsinline')).toBe(true);
    expect(video.querySelector('.marque-lecture')).not.toBeNull();
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('https://stockage.test/a.png'));
    await vi.waitFor(() => expect(v.getAttribute('src')).toBe('https://stockage.test/b.mp4#t=0.001'));
  });

  it('sans visuel, la case montre l’accroche ou « Sans visuel »', () => {
    const el = vueApercu(etatApercu([
      f('a', 'story', '2026-10-12T10:00:00.000Z', { accroche: 'Le matin, sans filtre' }),
      f('b', 'story', '2026-10-13T10:00:00.000Z'),
    ]), actionsFactices());
    const [a, b] = tuiles(el);
    expect(a.querySelector('.miniature-vide').textContent).toBe('Le matin, sans filtre');
    expect(b.querySelector('.miniature-vide').textContent).toBe('Sans visuel');
  });

  it('un lien qui échoue ne touche que sa miniature', async () => {
    const actions = actionsFactices({ urlVisuel: vi.fn(async id => { if (id === 'casse.png') throw new Error('x'); return `https://stockage.test/${id}`; }) });
    const el = vueApercu(etatApercu([
      f('a', 'post', '2026-10-12T10:00:00.000Z', { visuel: 'casse.png', visuel_type: 'image' }),
      f('b', 'post', '2026-10-13T10:00:00.000Z', { visuel: 'ok.png', visuel_type: 'image' }),
    ]), actions);
    const [a, b] = tuiles(el);
    await vi.waitFor(() => expect(a.textContent).toContain('Visuel indisponible'));
    await vi.waitFor(() => expect(b.querySelector('img').getAttribute('src')).toBe('https://stockage.test/ok.png'));
    expect(b.textContent).not.toContain('Visuel indisponible');
  });

  it('toucher une miniature ouvre la fiche', () => {
    const actions = actionsFactices();
    const el = vueApercu(etatApercu([f('a', 'reel', '2026-10-12T10:00:00.000Z')]), actions);
    tuiles(el)[0].click();
    expect(actions.ouvrirFiche).toHaveBeenCalledWith('a');
  });

  it('demande au plus 4 liens à la fois, et la cinquième quand une réponse arrive', async () => {
    const attentes = [];
    const actions = actionsFactices({ urlVisuel: vi.fn(() => new Promise(resoudre => attentes.push(resoudre))) });
    const fiches = [1, 2, 3, 4, 5, 6].map(i => f(`f${i}`, 'post', `2026-10-12T${String(8 + i).padStart(2, '0')}:00:00.000Z`, { visuel: `v${i}.png`, visuel_type: 'image' }));
    vueApercu(etatApercu(fiches), actions);
    expect(actions.urlVisuel).toHaveBeenCalledTimes(4);
    attentes[0]('https://stockage.test/v1.png');
    await vi.waitFor(() => expect(actions.urlVisuel).toHaveBeenCalledTimes(5));
  });

  it('garde les liens déjà obtenus quand la vue est reconstruite avec le même cache', async () => {
    const cache = creerCacheVisuels();
    const actions = actionsFactices();
    const fiches = [f('a', 'post', '2026-10-12T10:00:00.000Z', { visuel: 'a.png', visuel_type: 'image' })];
    const premiere = vueApercu(etatApercu(fiches, undefined, { cacheVisuels: cache }), actions);
    await vi.waitFor(() => expect(premiere.querySelector('img').getAttribute('src')).toBe('https://stockage.test/a.png'));
    const seconde = vueApercu(etatApercu(fiches, undefined, { cacheVisuels: cache }), actions);
    await vi.waitFor(() => expect(seconde.querySelector('img').getAttribute('src')).toBe('https://stockage.test/a.png'));
    expect(actions.urlVisuel).toHaveBeenCalledTimes(1);
  });
});

describe('vueApercu : légende et compte', () => {
  it('compte les fiches choisies par catégorie, et les non rangées (proposées comprises)', () => {
    const el = vueApercu(etatApercu([
      f('a', 'reel', '2026-10-12T10:00:00.000Z', { categorie: 'attraction' }),
      f('b', 'reel', '2026-10-13T10:00:00.000Z', { categorie: 'attraction' }),
      f('c', 'post', '2026-10-14T10:00:00.000Z', { categorie: 'conversion' }),
      f('d', 'story', '2026-10-15T10:00:00.000Z', { porte: true }),
      f('e', 'story', '2026-10-16T10:00:00.000Z'),
    ]), actionsFactices());
    const legende = el.querySelector('.legende-categories');
    expect(legende.querySelector('[data-categorie="attraction"] .legende-compte').textContent).toBe('2');
    expect(legende.querySelector('[data-categorie="conversion"] .legende-compte').textContent).toBe('1');
    expect(legende.querySelector('[data-categorie="preuve"] .legende-compte').textContent).toBe('0');
    expect(legende.querySelector('[data-categorie="non_rangees"] .legende-compte').textContent).toBe('2');
    expect(legende.textContent).toContain('Non rangées');
  });
});

describe('vueApercu : classe du conteneur', () => {
  it('le conteneur de la vue porte la classe vue-apercu, pas apercu (réservée au visuel de la fiche)', () => {
    const el = vueApercu(etatApercu([]), actionsFactices());
    expect(el.classList.contains('vue-apercu')).toBe(true);
    expect(el.classList.contains('apercu')).toBe(false);
  });
});

describe('onglet Aperçu (rendu)', () => {
  const monter = (vue, apercu = { periode: 'semaine', filtres: TOUS }, fiches = [f('a', 'reel', '2026-10-12T10:00:00.000Z'), f('b', 'story', '2026-10-13T10:00:00.000Z')]) => {
    const racine = document.createElement('div');
    const actions = actionsFactices({ changerVue: vi.fn(), naviguer: vi.fn(), allerAujourdhui: vi.fn() });
    const rendre = creerRendu(racine, actions, {}, () => ANCRE);
    const e = { profil: PROFIL, fiches, vue, ancre: ANCRE, apercu, sauvegarde: 'ok', erreur: null, ficheOuverte: null };
    rendre(e);
    return { racine, actions, rendre, e };
  };

  it('place l’onglet Aperçu entre Mois et Jour et ouvre la vue', () => {
    const { racine, actions } = monter('semaine');
    const onglets = [...racine.querySelectorAll('.onglet')].map(b => b.textContent);
    expect(onglets.slice(0, 4)).toEqual(['Semaine', 'Mois', 'Aperçu', 'Jour']);
    [...racine.querySelectorAll('.onglet')].find(b => b.textContent === 'Aperçu').click();
    expect(actions.changerVue).toHaveBeenCalledWith('apercu');
  });

  it('affiche la grille quand la vue est Aperçu, et les flèches de période s’y appliquent', () => {
    const { racine, actions } = monter('apercu');
    expect(racine.querySelector('.apercu-grille')).not.toBeNull();
    expect(racine.querySelector('.onglet[aria-current="page"]').textContent).toBe('Aperçu');
    racine.querySelector('button[aria-label="Période suivante"]').click();
    expect(actions.naviguer).toHaveBeenCalledWith(1);
  });

  it('reconstruit la grille quand le filtre change', () => {
    const { racine, rendre, e } = monter('apercu');
    expect(racine.querySelectorAll('button.miniature')).toHaveLength(2);
    rendre({ ...e, apercu: { periode: 'semaine', filtres: { story: true, reel: false, post: false } } });
    expect(racine.querySelectorAll('button.miniature')).toHaveLength(1);
  });

  it('le libellé de période suit l’Aperçu Mois', () => {
    const { racine } = monter('apercu', { periode: 'mois', filtres: TOUS });
    expect(racine.querySelector('.periode-libelle').textContent).toBe('octobre 2026');
  });

  it('une frappe dans une fiche ne reconstruit pas la grille : même miniature, même nœud', () => {
    const { racine, rendre, e } = monter('apercu');
    const avant = racine.querySelector('button.miniature');
    rendre({ ...e, fiches: e.fiches.map(x => ({ ...x, caption: 'tapée' })) });
    expect(racine.querySelector('button.miniature')).toBe(avant);
  });

  it('modifier l’accroche d’une fiche de la période reconstruit la grille', () => {
    const { racine, rendre, e } = monter('apercu');
    const avant = racine.querySelector('button.miniature');
    rendre({ ...e, fiches: e.fiches.map(x => ({ ...x, accroche: 'nouvelle' })) });
    expect(racine.querySelector('button.miniature')).not.toBe(avant);
  });
});

describe('vueApercu : liens, focus, nom accessible (round 1)', () => {
  it('chaque miniature a un nom accessible : date, format, accroche ou « Sans accroche », « Publié »', () => {
    const el = vueApercu(etatApercu([
      f('a', 'reel', '2026-10-12T10:00:00.000Z', { accroche: 'Le café' }),
      f('b', 'story', '2026-10-13T10:00:00.000Z', { statut: 'publie', publie_le: '2026-10-13T10:00:00.000Z' }),
    ]), actionsFactices());
    const [a, b] = tuiles(el);
    expect(a.getAttribute('aria-label')).toBe('lun. 12/10, Reel, Le café');
    expect(b.getAttribute('aria-label')).toBe('mar. 13/10, Story, Sans accroche, Publié');
  });

  it('un lien expiré (plus de 50 minutes) est redemandé, un lien récent non', async () => {
    let t = 0;
    const cache = creerCacheVisuels({ maintenant: () => t });
    const actions = actionsFactices();
    const etat = etatApercu([f('a', 'post', '2026-10-12T10:00:00.000Z', { visuel: 'a.png', visuel_type: 'image' })], undefined, { cacheVisuels: cache });
    vueApercu(etat, actions);
    expect(actions.urlVisuel).toHaveBeenCalledTimes(1);
    t = 49 * 60000;
    vueApercu(etat, actions);
    expect(actions.urlVisuel).toHaveBeenCalledTimes(1);
    t = 51 * 60000;
    const el = vueApercu(etat, actions);
    expect(actions.urlVisuel).toHaveBeenCalledTimes(2);
    await vi.waitFor(() => expect(el.querySelector('img').getAttribute('src')).toBe('https://stockage.test/a.png'));
  });

  it('une erreur de chargement de l’image refait un seul essai, puis affiche « Visuel indisponible »', async () => {
    const cache = creerCacheVisuels();
    const actions = actionsFactices();
    const etat = etatApercu([f('a', 'post', '2026-10-12T10:00:00.000Z', { visuel: 'a.png', visuel_type: 'image' })], undefined, { cacheVisuels: cache });
    const el = vueApercu(etat, actions);
    document.body.append(el);
    const img = el.querySelector('img');
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('https://stockage.test/a.png'));
    img.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(actions.urlVisuel).toHaveBeenCalledTimes(2));
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('https://stockage.test/a.png'));
    img.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(el.querySelector('button.miniature').textContent).toContain('Visuel indisponible'));
    expect(actions.urlVisuel).toHaveBeenCalledTimes(2);
    // Un visuel marqué en échec n'est pas redemandé à la reconstruction suivante.
    const suivante = vueApercu(etat, actions);
    await vi.waitFor(() => expect(suivante.querySelector('button.miniature').textContent).toContain('Visuel indisponible'));
    expect(actions.urlVisuel).toHaveBeenCalledTimes(2);
    el.remove();
  });

  it('une erreur sur un média détaché (remplacé par une reconstruction) ne touche ni ne supprime le cache', async () => {
    const cache = creerCacheVisuels();
    const actions = actionsFactices();
    const etat = etatApercu([f('a', 'post', '2026-10-12T10:00:00.000Z', { visuel: 'a.png', visuel_type: 'image' })], undefined, { cacheVisuels: cache });
    const el = vueApercu(etat, actions);
    const img = el.querySelector('img');
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('https://stockage.test/a.png'));
    img.dispatchEvent(new Event('error'));
    img.dispatchEvent(new Event('error'));
    expect(cache.urls.has('a.png')).toBe(true);
    expect(cache.urls.get('a.png').echec).toBe(false);
    expect(actions.urlVisuel).toHaveBeenCalledTimes(1);
    expect(el.querySelector('button.miniature').textContent).not.toContain('Visuel indisponible');
  });

  it('un lien en échec n’est pas redemandé à la reconstruction, mais l’est après un changement de période', async () => {
    const cache = creerCacheVisuels();
    const actions = actionsFactices({ urlVisuel: vi.fn(async () => { throw new Error('x'); }) });
    const fiche = f('a', 'post', '2026-10-12T10:00:00.000Z', { visuel: 'a.png', visuel_type: 'image' });
    const etat = etatApercu([fiche], undefined, { cacheVisuels: cache });
    const premiere = vueApercu(etat, actions);
    await vi.waitFor(() => expect(premiere.textContent).toContain('Visuel indisponible'));
    const reconstruite = vueApercu({ ...etat, fiches: [{ ...fiche, caption: 'autre' }] }, actions);
    await vi.waitFor(() => expect(reconstruite.textContent).toContain('Visuel indisponible'));
    expect(actions.urlVisuel).toHaveBeenCalledTimes(1);
    vueApercu({ ...etat, apercu: { periode: 'mois', filtres: TOUS } }, actions);
    expect(actions.urlVisuel).toHaveBeenCalledTimes(2);
  });

  it('la légende ne compte que la sélection affichée', () => {
    const el = vueApercu(etatApercu([
      f('a', 'reel', '2026-10-12T10:00:00.000Z', { categorie: 'attraction' }),
      f('b', 'story', '2026-10-13T10:00:00.000Z', { categorie: 'attraction' }),
    ], { periode: 'semaine', filtres: { story: false, reel: true, post: false } }), actionsFactices());
    expect(el.querySelector('[data-categorie="attraction"] .legende-compte').textContent).toBe('1');
  });

  it('après un changement de filtre, le focus revient sur la même case', () => {
    const racine = document.createElement('div');
    document.body.append(racine);
    let e = { profil: PROFIL, fiches: [f('a', 'reel', '2026-10-12T10:00:00.000Z')], vue: 'apercu', ancre: ANCRE, apercu: { periode: 'semaine', filtres: TOUS }, sauvegarde: 'ok', erreur: null, ficheOuverte: null };
    const actions = actionsFactices({ changerVue: vi.fn(), naviguer: vi.fn(), allerAujourdhui: vi.fn() });
    actions.changerFiltresApercu = vi.fn(filtres => { e = { ...e, apercu: { ...e.apercu, filtres } }; rendre(e); });
    actions.changerPeriodeApercu = vi.fn(periode => { e = { ...e, apercu: { ...e.apercu, periode } }; rendre(e); });
    const rendre = creerRendu(racine, actions, {}, () => ANCRE);
    rendre(e);
    const reels = racine.querySelector('input[data-commande="format:reel"]');
    reels.checked = false;
    reels.dispatchEvent(new Event('change'));
    const nouvelle = racine.querySelector('input[data-commande="format:reel"]');
    expect(nouvelle).not.toBe(reels);
    expect(document.activeElement).toBe(nouvelle);
    const mois = racine.querySelector('input[data-commande="periode:mois"]');
    mois.dispatchEvent(new Event('change'));
    expect(document.activeElement).toBe(racine.querySelector('input[data-commande="periode:mois"]'));
    racine.remove();
  });
});
