// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import { vueSemaine } from '../../src/interface/vue-semaine.js';
import { creerCacheVisuels } from '../../src/interface/vue-apercu.js';
import { creerRendu } from '../../src/interface/rendu.js';
import { creerCacheVisuels as creerCacheDeVisuels } from '../../src/interface/visuels.js';
import { bandeau, carte } from '../../src/interface/carte.js';
import { libelleJour } from '../../src/logique/dates.js';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const ANCRE = '2026-09-30T10:00:00.000Z';
const actionsFactices = () => ({ ouvrirFiche: vi.fn(), creerFiche: vi.fn(), deplacerFiche: vi.fn() });
const reel = (id, date_heure, extra = {}) => ({ ...nouvelleFiche({ id, format: 'reel', date_heure, pilier: 'nuit', maintenant: ANCRE }), ...extra });
// Sept stories, une par jour de la semaine d’ANCRE : la pastille « stories » passe au vert, donc le détail du bandeau existe.
const storiesVertes = () => ['28', '29', '30', '1', '2', '3', '4'].map((j, i) => nouvelleFiche({ id: `v${i}`, format: 'story', date_heure: `${i < 3 ? '2026-09-' : '2026-10-0'}${j}T10:00:00.000Z`, pilier: 'nuit', maintenant: ANCRE }));

describe('vueSemaine', () => {
  it('affiche le bandeau et 7 colonnes', () => {
    const el = vueSemaine({ profil: fictif, fiches: storiesVertes(), ancre: ANCRE }, actionsFactices());
    // Le bandeau ne porte que le contrôle de la semaine (3 pastilles) ; les catégories sont dans la légende.
    expect(el.querySelectorAll('.bandeau-complet .pastille')).toHaveLength(3);
    expect([...el.querySelectorAll('.jour')].map(j => j.dataset.jour)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  });

  it('place une carte dans la bonne colonne et l’ouvre au clic', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-10-01T16:00:00.000Z', { caption: 'Ma phrase' })], ancre: ANCRE }, actions);
    const colonne = el.querySelector('[data-jour="2026-10-01"]');
    const c = colonne.querySelector('.carte');
    expect(c.textContent).toContain('Ma phrase');
    expect(c.textContent).toContain('18:00');
    expect(c.style.getPropertyValue('--categorie')).toBe('var(--trait)');
    c.click();
    expect(actions.ouvrirFiche).toHaveBeenCalledWith('a');
  });

  it('propose les créneaux vides et crée la fiche correspondante', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE }, actions);
    const vides = el.querySelectorAll('.creneau-vide');
    expect(vides).toHaveLength(3);
    expect(vides[0].textContent).toBe('+ Reel · 12:00');
    vides[0].click();
    expect(actions.creerFiche).toHaveBeenCalledWith({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
  });

  it('déplace une carte déposée sur un autre jour', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-28T10:00:00.000Z')], ancre: ANCRE }, actions);
    const cible = el.querySelector('[data-jour="2026-10-02"]');
    const evt = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(evt, 'dataTransfer', { value: { getData: () => 'a' } });
    cible.dispatchEvent(evt);
    expect(actions.deplacerFiche).toHaveBeenCalledWith('a', '2026-10-01T22:00:00.000Z');
  });

  it('montre le cadenas et le point à réévaluer sur le badge', () => {
    const f = reel('a', '2026-09-28T10:00:00.000Z', { caption: 'x' });
    const bloquee = { ...f, score: { total: 38, conformite: { etat: 'rouge', causes: ['lien'] }, empreinte: empreinte(f) } };
    const perimee = { ...f, id: 'b', caption: 'changée', score: { total: 70, conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(f) } };
    const el = vueSemaine({ profil: fictif, fiches: [bloquee, perimee], ancre: ANCRE }, actionsFactices());
    const badges = el.querySelectorAll('.badge');
    expect(badges[0].classList.contains('badge-bloque')).toBe(true);
    expect(badges[0].querySelector('svg')).not.toBeNull();
    expect(badges[1].querySelector('.point')).not.toBeNull();
  });

  it('rend l’état des pastilles lisible sans la couleur', () => {
    const el = vueSemaine({ profil: fictif, fiches: storiesVertes(), ancre: ANCRE }, actionsFactices());
    const rouge = el.querySelector('.pastille-rouge');
    const vert = el.querySelector('.pastille-vert');
    expect(rouge.querySelector('.visuellement-masque').textContent).toBe(' : hors cible');
    expect(vert.querySelector('.visuellement-masque').textContent).toBe(' : conforme à la cible');
  });

  it('ne propose plus les créneaux passés', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE, maintenant: '2026-09-29T11:00:00.000Z' }, actions);
    const vides = el.querySelectorAll('.creneau-vide');
    expect(vides).toHaveLength(1);
    expect(vides[0].textContent).toBe('+ Reel · 12:00');
    expect(vides[0].closest('[data-jour]').dataset.jour).toBe('2026-10-01');
  });

  // Adapté : la mention « Pas de bulletin » et son bouton sont retirés de la Semaine (A3).
  it('n’affiche plus « Pas de bulletin » ni le bouton « Voir l’onglet Bulletin », même sans bulletin', () => {
    const actions = { ...actionsFactices(), changerVue: vi.fn() };
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE, bulletin: null }, actions);
    expect(el.textContent).not.toContain('Pas de bulletin');
    expect(el.querySelector('.sans-bulletin')).toBeNull();
    expect([...el.querySelectorAll('button')].some(b => b.textContent === 'Voir l’onglet Bulletin')).toBe(false);
  });
});

describe('contrôle de la semaine (A1)', () => {
  const p = (cle, etat) => ({ cle, libelle: cle, valeur: '0/1', etat });
  const pastilles = [p('a', 'vert'), p('b', 'orange'), p('c', 'rouge'), p('d', 'vert')];
  const visibles = el => [...el.querySelectorAll('.bandeau > .pastille')].map(li => li.children[0].textContent);

  it('ne montre que les pastilles orange et rouges, avec « N sur M au vert » et « Tout voir »', () => {
    const el = bandeau(pastilles);
    expect(el.querySelector('.bandeau-resume').textContent).toBe('2 sur 4 au vert');
    expect(visibles(el)).toEqual(['b', 'c']);
    expect(el.querySelector('.bandeau').getAttribute('aria-label')).toBe('Contrôle de la semaine');
    const detail = el.querySelector('details.bandeau-detail');
    expect(detail.querySelector('summary').textContent).toBe('Tout voir');
    expect(detail.querySelectorAll('.bandeau-complet .pastille')).toHaveLength(4);
  });

  it('toutes vertes : « M sur M au vert » et le détail complet', () => {
    const el = bandeau([p('a', 'vert'), p('b', 'vert')]);
    expect(el.querySelector('.bandeau-resume').textContent).toBe('2 sur 2 au vert');
    expect(visibles(el)).toEqual([]);
    expect(el.querySelectorAll('.bandeau-complet .pastille')).toHaveLength(2);
  });

  it('toutes vertes : la liste visible n’est pas rendue du tout', () => {
    const el = bandeau([p('a', 'vert'), p('b', 'vert')]);
    expect(el.querySelector('ul[aria-label="Contrôle de la semaine"]')).toBeNull();
    expect(el.querySelector('.bandeau-resume').textContent).toBe('2 sur 2 au vert');
  });

  it('sans pastille verte : pas de détail', () => {
    const el = bandeau([p('b', 'orange'), p('c', 'rouge')]);
    expect(el.querySelector('.bandeau-resume').textContent).toBe('0 sur 2 au vert');
    expect(el.querySelector('details.bandeau-detail')).toBeNull();
  });
});

describe('catégories dans la semaine', () => {
  const NOMS = ['Attraction', 'Autorité', 'Connexion', 'Désir', 'Preuve', 'Conversion'];
  const jour = (id, heure, extra = {}) => reel(id, `2026-10-01T${heure}:00:00.000Z`, extra);

  it('la carte prend la couleur de sa catégorie choisie ; proposition ou rien : neutre', () => {
    const el = vueSemaine({ profil: fictif, fiches: [jour('a', '10', { categorie: 'desir' }), jour('b', '12', { cta: true }), jour('c', '14')], ancre: ANCRE }, actionsFactices());
    expect(el.querySelector('.carte[data-id="a"]').style.getPropertyValue('--categorie')).toBe('#b3125a');
    expect(el.querySelector('.carte[data-id="b"]').style.getPropertyValue('--categorie')).toBe('var(--trait)');
    expect(el.querySelector('.carte[data-id="c"]').style.getPropertyValue('--categorie')).toBe('var(--trait)');
  });

  it('une couleur de catégorie personnalisée par le profil s’applique à la carte', () => {
    const perso = structuredClone(fictif);
    perso.categories_de_contenu.categories = [{ cle: 'attraction', couleur: '#123456' }];
    const el = vueSemaine({ profil: perso, fiches: [jour('a', '10', { categorie: 'attraction' })], ancre: ANCRE }, actionsFactices());
    expect(el.querySelector('.carte[data-id="a"]').style.getPropertyValue('--categorie')).toBe('#123456');
  });

  // Adapté : les pastilles de catégories ne sont plus dans le bandeau ; la légende porte leur valeur courte (A2).
  it('la légende porte une valeur courte par catégorie : « n/cible », « n/min-max », deux séparées par « · »', () => {
    const el = vueSemaine({ profil: fictif, fiches: [jour('a', '10', { categorie: 'attraction' })], ancre: ANCRE }, actionsFactices());
    const legende = el.querySelector('.legende-categories');
    const valeur = cle => legende.querySelector(`[data-categorie="${cle}"] .legende-valeur`)?.textContent;
    expect(valeur('attraction')).toBe('1/3');
    expect(valeur('autorite')).toBe('0/2');
    expect(valeur('connexion')).toBe('0/3-5');
    expect(valeur('conversion')).toBe('0/1 · 0/2-3');
    expect(el.querySelector('.bandeau').textContent).not.toContain('contenus du fil');
  });

  it('un état orange ou rouge se voit par une classe et un texte masqué ; le title donne la valeur longue', () => {
    const el = vueSemaine({ profil: fictif, fiches: [jour('a', '10', { categorie: 'attraction' })], ancre: ANCRE }, actionsFactices());
    const attraction = el.querySelector('[data-categorie="attraction"]');
    expect(attraction.classList.contains('etat-rouge')).toBe(true);
    expect(attraction.title).toBe('1 sur 3 contenus du fil');
    expect(attraction.querySelector('.visuellement-masque').textContent).toBe('1 sur 3 contenus du fil : hors cible');
    const preuve = el.querySelector('[data-categorie="preuve"]');
    expect(preuve.classList.contains('etat-orange')).toBe(true);
    expect(preuve.querySelector('.visuellement-masque').textContent).toBe('0 sur 1 contenu du fil : à surveiller');
  });

  it('une catégorie à deux pastilles : le texte masqué place l’état après chaque valeur longue en orange ou rouge', () => {
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE }, actionsFactices());
    const conversion = el.querySelector('[data-categorie="conversion"]');
    expect(conversion.classList.contains('etat-rouge')).toBe(true);
    expect(conversion.querySelector('.visuellement-masque').textContent).toBe('0 sur 1 contenu du fil : à surveiller ; 0 story, objectif 2 à 3 : hors cible');
    expect(conversion.title).toBe('0 sur 1 contenu du fil · 0 story, objectif 2 à 3');
  });

  it('sans cible, la catégorie n’a que son nom', () => {
    const perso = structuredClone(fictif);
    perso.categories_de_contenu.categories = [];
    const el = vueSemaine({ profil: perso, fiches: [], ancre: ANCRE }, actionsFactices());
    expect(el.querySelector('[data-categorie="desir"]').textContent).toBe('Désir');
    expect(el.querySelector('[data-categorie="desir"] .legende-valeur')).toBeNull();
  });

  it('la légende compte les fiches non rangées par « Non rangées N »', () => {
    const el = vueSemaine({ profil: fictif, fiches: [jour('a', '10')], ancre: ANCRE }, actionsFactices());
    expect(el.querySelector('[data-categorie="non_rangees"] .legende-valeur').textContent).toBe('1');
  });

  it('légende « Catégories » sous le contrôle, avec les six noms et les couleurs du profil', () => {
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE }, actionsFactices());
    const legende = el.querySelector('.legende-categories');
    expect(legende.textContent).toContain('Catégories');
    for (const nom of NOMS) expect(legende.textContent).toContain(nom);
    expect(legende.querySelector('[data-categorie="attraction"]').style.getPropertyValue('--categorie')).toBe('#d9622b');
    expect(legende.querySelector('[data-categorie="desir"]').style.getPropertyValue('--categorie')).toBe('#b3125a');
    expect(el.querySelector('.bandeau-zone').nextElementSibling).toBe(legende);
  });

  it('profil sans section : ni légende quand aucune fiche de la semaine n’est rangée', () => {
    const sans = structuredClone(fictif);
    delete sans.categories_de_contenu;
    const el = vueSemaine({ profil: sans, fiches: [jour('a', '10'), ...storiesVertes()], ancre: ANCRE }, actionsFactices());
    expect(el.querySelectorAll('.bandeau-complet .pastille')).toHaveLength(3);
    expect(el.querySelector('.legende-categories')).toBeNull();
  });

  it('profil sans section : la légende apparaît dès qu’une fiche de la semaine a une catégorie choisie', () => {
    const sans = structuredClone(fictif);
    delete sans.categories_de_contenu;
    const el = vueSemaine({ profil: sans, fiches: [jour('a', '10', { categorie: 'desir' }), ...storiesVertes()], ancre: ANCRE }, actionsFactices());
    const legende = el.querySelector('.legende-categories');
    expect(legende).not.toBeNull();
    expect(legende.querySelector('[data-categorie="desir"]')).not.toBeNull();
    expect(el.querySelectorAll('.bandeau-complet .pastille')).toHaveLength(3);
  });

  it('une fiche masquée compte toujours dans la légende', () => {
    const apercu = { periode: 'semaine', filtres: { story: true, reel: false, post: true } };
    const el = vueSemaine({ profil: fictif, fiches: [jour('a', '10', { categorie: 'attraction' })], ancre: ANCRE, apercu }, actionsFactices());
    expect(el.querySelector('.carte[data-id="a"]')).toBeNull();
    expect(el.querySelector('[data-categorie="attraction"] .legende-valeur').textContent).toBe('1/3');
  });
});

describe('cartes épurées (A5)', () => {
  it('la carte n’écrit plus le nom du pilier, et sa ligne tient « Format · heure »', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-10-01T16:00:00.000Z', { categorie: 'desir' })], ancre: ANCRE }, actionsFactices());
    const c = el.querySelector('.carte[data-id="a"]');
    expect(c.querySelector('.carte-pilier')).toBeNull();
    expect(c.textContent).not.toContain('Nuit');
    expect(c.querySelector('.carte-tete').textContent).toBe('Reel · 18:00');
  });

  it('le statut est un point, avec son libellé masqué visuellement et en infobulle', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-10-01T16:00:00.000Z')], ancre: ANCRE }, actionsFactices());
    const point = el.querySelector('.carte[data-id="a"] .point-statut');
    expect(point.classList.contains('statut-idee')).toBe(true);
    expect(point.title).toBe('Idée');
    expect(point.querySelector('.visuellement-masque').textContent).toBe('Idée');
    expect(el.querySelector('.carte[data-id="a"] .carte-pied').textContent).toBe('Idée');
  });

  it('sans score, la note n’apparaît pas : ni badge ni « — »', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-10-01T16:00:00.000Z')], ancre: ANCRE }, actionsFactices());
    expect(el.querySelector('.carte[data-id="a"] .badge')).toBeNull();
    expect(el.querySelector('.carte[data-id="a"]').textContent).not.toContain('—');
  });

  it('la ligne d’action n’apparaît que pour une action en retard', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-10-02T10:00:00.000Z')], ancre: ANCRE, maintenant: '2026-09-30T08:00:00.000Z', stats: [] }, actionsFactices());
    expect(el.querySelector('.carte[data-id="a"] .carte-action')).toBeNull();
  });

  it('chaque statut a sa forme et le validé n’est plus orange (CSS)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/interface/styles.css'), 'utf8');
    const regle = s => css.match(new RegExp(`\\.point-statut\\.statut-${s}\\s*\\{([^}]*)\\}`))?.[1] ?? '';
    expect(css).toMatch(/\.point-statut\s*\{[^}]*width:\s*10px/);
    expect(regle('idee')).toContain('--texte-2');
    expect(regle('brouillon')).toContain('--texte-2');
    expect(regle('valide')).not.toContain('--orange');
    expect(regle('valide')).toContain('--accent');
    // Validé = cercle plein accent avec un anneau ; brouillon reste un cercle plein gris, sans anneau.
    expect(regle('valide')).toContain('box-shadow');
    expect(regle('brouillon')).not.toContain('box-shadow');
    expect(regle('programme')).toContain('rotate(45deg)');
    expect(regle('publie')).toContain('--vert');
  });

  it('l’accroche tient sur deux lignes au plus (CSS)', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/interface/styles.css'), 'utf8');
    expect(css).toMatch(/\.carte-accroche\s*\{[^}]*-webkit-line-clamp:\s*2/);
  });
});

describe('à faire et créneaux (A4, A6, A7)', () => {
  const M = '2026-09-30T08:00:00.000Z';
  const sansFormat = { periode: 'semaine', filtres: { story: false, reel: false, post: false } };

  it('« À faire (N) » est replié, et ouvert quand une ligne est en retard', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-29T10:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    const d = el.querySelector('details.a-faire');
    expect(d.querySelector('summary').textContent).toBe('À faire (1, dont 1 en retard)');
    expect(d.open).toBe(true);
    const plusTard = vueSemaine({ profil: fictif, fiches: [reel('b', '2026-10-02T10:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    expect(plusTard.querySelector('details.a-faire').open).toBe(false);
  });

  it('sans ligne, pas de section « À faire » du tout', () => {
    const f = reel('p', '2026-09-29T10:00:00.000Z', { statut: 'publie', publie_le: '2026-09-29T10:00:00.000Z' });
    const el = vueSemaine({ profil: fictif, fiches: [f], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    expect(el.querySelector('.a-faire')).toBeNull();
    expect(el.textContent).not.toContain('Rien à faire');
  });

  it('un jour a un seul bouton : le premier créneau visible, sinon « + Ajouter » avec un nom accessible', () => {
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE, apercu: { periode: 'semaine', filtres: { story: true, reel: false, post: false } } }, actionsFactices());
    for (const colonne of el.querySelectorAll('.jour')) {
      expect(colonne.querySelectorAll('button.creneau-vide, button.ajouter')).toHaveLength(1);
    }
    expect(el.querySelectorAll('.creneau-vide')).toHaveLength(0);
    const generique = el.querySelector('[data-jour="2026-09-28"] button.ajouter');
    expect(generique.getAttribute('aria-label')).toBe(`Ajouter un contenu le ${libelleJour('2026-09-28T10:00:00.000Z', fictif.regles_studio.fuseau)}`);
  });

  it('un créneau visible du jour remplace « + Ajouter » et crée sa fiche', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE }, actions);
    const bouton = el.querySelector('[data-jour="2026-09-28"] button.creneau-vide');
    expect(el.querySelector('[data-jour="2026-09-28"] button.ajouter')).toBeNull();
    expect(bouton.textContent).toBe('+ Reel · 12:00');
    bouton.click();
    expect(actions.creerFiche).toHaveBeenCalledWith({ format: 'reel', date_heure: '2026-09-28T10:00:00.000Z' });
  });

  it('« À faire (N) » est un titre h3 dans le summary, pour la navigation par titres', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-29T10:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    expect(el.querySelector('details.a-faire summary h3').textContent).toBe('À faire (1, dont 1 en retard)');
  });

  it('« À faire » compte les retards quand il y en a, et ne les compte pas sinon', () => {
    const deux = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-29T10:00:00.000Z'), reel('b', '2026-10-02T10:00:00.000Z'), reel('c', '2026-09-30T12:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    expect(deux.querySelector('details.a-faire summary h3').textContent).toBe('À faire (3, dont 1 en retard)');
    const plus = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-29T10:00:00.000Z'), reel('d', '2026-09-29T11:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    expect(plus.querySelector('details.a-faire summary h3').textContent).toBe('À faire (2, dont 2 en retard)');
    const sans = vueSemaine({ profil: fictif, fiches: [reel('b', '2026-10-02T10:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    expect(sans.querySelector('details.a-faire summary h3').textContent).toBe('À faire (1)');
  });

  it('le premier créneau du jour a un format masqué : le bouton propose le créneau visible plus tardif', () => {
    const profil = structuredClone(fictif);
    profil.regles_studio.creneaux = [{ jours: [1], debut: '10:00', fin: '11:00' }, { jours: [1], debut: '14:00', fin: '15:00' }];
    profil.regles_studio.cadence = { ...profil.regles_studio.cadence, reel: 1, carrousel: 1 };
    const actions = actionsFactices();
    const el = vueSemaine({ profil, fiches: [], ancre: ANCRE, apercu: { periode: 'semaine', filtres: { story: true, reel: false, post: true } } }, actions);
    const bouton = el.querySelector('[data-jour="2026-09-28"] button.creneau-vide');
    expect(bouton.textContent).toBe('+ Carrousel · 14:00');
    bouton.click();
    expect(actions.creerFiche).toHaveBeenCalledWith({ format: 'carrousel', date_heure: '2026-09-28T12:00:00.000Z' });
  });

  it('un format masqué n’est jamais proposé en créneau', () => {
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE, apercu: { periode: 'semaine', filtres: { story: true, reel: false, post: false } } }, actionsFactices());
    expect([...el.querySelectorAll('.creneau-vide')].some(b => b.textContent.includes('Reel'))).toBe(false);
  });

  it('sans format coché : seule la barre parle, pas de « À faire » ni « Rien de prévu »', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-29T10:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [], apercu: sansFormat }, actionsFactices());
    expect(el.querySelector('.a-faire')).toBeNull();
    expect(el.textContent.match(/Coche au moins un format\./g)).toHaveLength(1);
    expect(el.textContent).not.toContain('Rien de prévu');
  });
});

describe('parcours dans la semaine', () => {
  const M = '2026-09-30T08:00:00.000Z';
  it('affiche la prochaine action sur chaque carte, en retard si besoin', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-29T10:00:00.000Z'), reel('b', '2026-10-02T10:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    const a = el.querySelector('.carte[data-id="a"] .carte-action');
    expect(a.textContent).toBe('Valider la fiche');
    expect(a.classList.contains('action-retard')).toBe(true);
    // Adapté : la ligne d’action n’apparaît que pour une action en retard (A5).
    expect(el.querySelector('.carte[data-id="b"] .carte-action')).toBeNull();
  });

  it('liste « À faire cette semaine », retards d’abord, et ouvre la fiche', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [reel('b', '2026-10-02T10:00:00.000Z', { caption: 'Plus tard' }), reel('a', '2026-09-29T10:00:00.000Z', { caption: 'En retard' })], ancre: ANCRE, maintenant: M, stats: [] }, actions);
    const lignes = [...el.querySelectorAll('.a-faire li')];
    expect(lignes.map(l => l.textContent.includes('En retard'))).toEqual([true, false]);
    expect(lignes[0].classList.contains('action-retard')).toBe(true);
    const bouton = [...lignes[0].querySelectorAll('button')].find(b => b.textContent === 'Ouvrir');
    expect(bouton.getAttribute('aria-label')).toBe('Ouvrir « En retard »');
    bouton.click();
    expect(actions.ouvrirFiche).toHaveBeenCalledWith('a');
  });

  // Adapté : sans ligne « À faire », la section disparaît (A4) et la carte n’a pas de ligne d’action hors retard (A5).
  it('n’inclut pas les fiches sans action, et n’affiche pas de ligne d’action hors retard', () => {
    const f = reel('p', '2026-09-29T10:00:00.000Z', { statut: 'publie', publie_le: '2026-09-29T10:00:00.000Z' });
    const el = vueSemaine({ profil: fictif, fiches: [f], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    expect(el.querySelector('.a-faire')).toBeNull();
    expect(el.querySelector('.carte[data-id="p"] .carte-action')).toBeNull();
  });

  it('les relevés de l’état comptent pour les fiches publiées', () => {
    const f = reel('p', '2026-09-28T06:00:00.000Z', { statut: 'publie', publie_le: '2026-09-28T06:00:00.000Z' });
    const sans = vueSemaine({ profil: fictif, fiches: [f], ancre: ANCRE, maintenant: '2026-10-01T08:00:00.000Z', stats: [] }, actionsFactices());
    expect(sans.querySelector('.carte-action').textContent).toBe('Saisir les stats à 48 h');
    const avec = vueSemaine({ profil: fictif, fiches: [f], ancre: ANCRE, maintenant: '2026-10-01T08:00:00.000Z', stats: [{ fiche: 'p', releve: '48h' }] }, actionsFactices());
    expect(avec.querySelector('.carte-action')).toBeNull();
    expect(avec.textContent).not.toContain('null');
  });
});

describe('analyse par dossier', () => {
  const etat = (plus = {}) => ({ profil: fictif, fiches: [], ancre: ANCRE, ...plus });
  const bouton = el => [...el.querySelectorAll('button')].find(x => x.textContent === 'Analyser la semaine');
  const boutonRetour = el => [...el.querySelectorAll('button')].find(x => x.textContent === 'Coller un retour');
  it('propose le bouton quand la capacité existe', () => {
    const a = { ...actionsFactices(), ouvrirAnalyse: vi.fn() };
    bouton(vueSemaine(etat(), a, { dossier: true })).click();
    expect(a.ouvrirAnalyse).toHaveBeenCalled();
    expect(bouton(vueSemaine(etat(), a, {}))).toBeUndefined();
    expect(bouton(vueSemaine(etat(), a))).toBeUndefined();
  });
  it('désactive les boutons tant qu’un panneau d’analyse est ouvert', () => {
    const a = { ...actionsFactices(), ouvrirAnalyse: vi.fn() };
    expect(bouton(vueSemaine(etat({ analyse: { etape: 'preparation' } }), a, { dossier: true })).disabled).toBe(true);
    expect(bouton(vueSemaine(etat({ analyse: { etape: 'pret' } }), a, { dossier: true })).disabled).toBe(true);
    expect(bouton(vueSemaine(etat({ analyse: { etape: 'retour' } }), a, { dossier: true })).disabled).toBe(true);
    expect(boutonRetour(vueSemaine(etat({ analyse: { etape: 'pret' } }), a, { dossier: true })).disabled).toBe(true);
    expect(bouton(vueSemaine(etat({ analyse: null }), a, { dossier: true })).disabled).toBe(false);
  });
  it('affiche l’avis de la période', () => {
    const periode = { type: 'semaine', cle: '2026-W40' };
    const analyses = [{ id: 'D-1', periode, assistant: 'claude', fiches: [], retour: { recu_le: '2026-09-30T10:00:00.000Z', avis: 'Bonne semaine', points_forts: [], risques: [], ordre_conseille: [] } }];
    const el = vueSemaine(etat({ analyses }), actionsFactices(), { dossier: true });
    expect(el.querySelector('details.avis-periode').textContent).toContain('Bonne semaine');
    expect(vueSemaine(etat({ analyses: [] }), actionsFactices(), { dossier: true }).querySelector('.avis-periode')).toBeNull();
  });
});

describe('coller un retour (Semaine)', () => {
  it('propose « Coller un retour » avec la capacité, sans elle non', () => {
    const a = { ...actionsFactices(), ouvrirAnalyse: vi.fn(), ouvrirRetour: vi.fn() };
    const trouver = el => [...el.querySelectorAll('button')].find(x => x.textContent === 'Coller un retour');
    const b = trouver(vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE }, a, { dossier: true }));
    expect(b.className).toBe('bouton-secondaire');
    b.click();
    expect(a.ouvrirRetour).toHaveBeenCalled();
    expect(trouver(vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE }, a, {}))).toBeUndefined();
  });
});

describe('« Valider la fiche » et ses avertissements', () => {
  const M = '2026-09-30T08:00:00.000Z';
  const prete = reel('a', '2026-09-29T10:00:00.000Z', { accroche: 'Prête', caption: 'x', visuel: 'v.jpg' });
  const perimee = { ...prete, id: 'b', accroche: 'Périmée', caption: 'changée', score: { total: 70, conformite: { etat: 'vert', causes: [] }, empreinte: empreinte(prete) } };
  const rendre = capacites => vueSemaine({ profil: fictif, fiches: [prete, perimee], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices(), capacites);

  it('propose « Valider la fiche » sans sample et avec dossier, avec les avertissements en détail', () => {
    const el = rendre({ dossier: true });
    const lignes = [...el.querySelectorAll('.a-faire li')];
    expect(lignes).toHaveLength(2);
    for (const l of lignes) {
      expect(l.querySelector('strong').textContent).toBe('Valider la fiche');
      expect(l.classList.contains('action-retard')).toBe(true);
    }
    expect(lignes.map(l => l.querySelector('.aide').textContent).sort()).toEqual(['Analyse dépassée : la fiche a changé depuis', 'Pas encore analysée']);
    expect(el.querySelector('.carte[data-id="a"] .carte-action').textContent).toBe('Valider la fiche');
    expect(el.querySelector('.carte[data-id="b"] .carte-action').textContent).toBe('Valider la fiche');
  });

  it('propose « Valider la fiche » avec sample, sans « Évaluer » ni « Réévaluer »', () => {
    const el = rendre({ sample: true, dossier: true });
    expect([...el.querySelectorAll('.a-faire li strong')].map(s => s.textContent)).toEqual(['Valider la fiche', 'Valider la fiche']);
    expect(el.querySelector('.carte[data-id="a"] .carte-action').textContent).toBe('Valider la fiche');
  });

  it('propose « Valider la fiche » sans aucune capacité', () => {
    const el = rendre({});
    expect([...el.querySelectorAll('.a-faire li strong')].map(s => s.textContent)).toEqual(['Valider la fiche', 'Valider la fiche']);
  });
});

describe('vueSemaine : formats et miniatures', () => {
  const TOUS = { story: true, reel: true, post: true };
  const sansStory = { periode: 'semaine', filtres: { story: false, reel: true, post: true } };
  const DEBUT_SUIVANT = '2026-10-07T10:00:00.000Z';
  // Adapté : le détail « Tout voir » porte toutes les pastilles, les visibles seules ne suffisent pas.
  const pastille = (el, libelle) => [...el.querySelectorAll('.bandeau-complet .pastille')].find(p => p.children[0].textContent === libelle)?.children[1].textContent;
  const avecUrls = (extra = {}) => ({ ...actionsFactices(), urlVisuel: vi.fn(async id => `https://stockage.test/${id}`), ...extra });
  const etat = (fiches, apercu = { periode: 'semaine', filtres: TOUS }, extra = {}) => ({ profil: fictif, fiches, ancre: ANCRE, apercu, ...extra });
  const story = (id, date_heure, extra = {}) => ({ ...nouvelleFiche({ id, format: 'story', date_heure, pilier: 'nuit', maintenant: ANCRE }), ...extra });

  it('un format masqué disparaît des colonnes et de « À faire », mais le bandeau compte toujours la story', () => {
    const fiches = [story('s', '2026-09-29T10:00:00.000Z'), reel('r', '2026-09-30T10:00:00.000Z'), ...storiesVertes()];
    const el = vueSemaine(etat(fiches, sansStory), avecUrls());
    expect(el.querySelector('.carte[data-id="s"]')).toBeNull();
    expect(el.querySelector('.carte[data-id="r"]')).not.toBeNull();
    expect(el.querySelector('.a-faire').textContent).not.toContain('Story');
    const tout = vueSemaine(etat(fiches), avecUrls());
    expect(pastille(el, 'Jours avec stories')).toBe(pastille(tout, 'Jours avec stories'));
    expect(el.querySelector('.bandeau-complet').textContent).toContain('Jours avec stories');
  });

  it('la mention du filtre s’affiche sous la barre quand un format est masqué', () => {
    const el = vueSemaine(etat([], sansStory), avecUrls());
    expect(el.querySelector('.barre-formats .mention-filtre').textContent).toBe('Filtre actif : Stories masquées');
  });

  it('une carte dont la fiche a un visuel image l’affiche en haut, et demande le lien', async () => {
    const actions = avecUrls();
    const el = vueSemaine(etat([reel('a', '2026-09-29T10:00:00.000Z', { visuel: 'a.png', visuel_type: 'image' })]), actions);
    const img = el.querySelector('.carte[data-id="a"] .carte-visuel img');
    expect(img).not.toBeNull();
    expect(el.querySelector('.carte[data-id="a"]').firstElementChild.classList.contains('carte-visuel')).toBe(true);
    expect(actions.urlVisuel).toHaveBeenCalledWith('a.png');
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('https://stockage.test/a.png'));
  });

  it('un visuel vidéo s’affiche comme une vidéo', () => {
    const el = vueSemaine(etat([reel('v', '2026-09-29T10:00:00.000Z', { visuel: 'v.mp4', visuel_type: 'video' })]), avecUrls());
    expect(el.querySelector('.carte[data-id="v"] .carte-visuel video')).not.toBeNull();
  });

  it('une fiche sans visuel n’a pas de zone visuelle', () => {
    const el = vueSemaine(etat([reel('a', '2026-09-29T10:00:00.000Z', { caption: 'Sans image' })]), avecUrls());
    expect(el.querySelector('.carte[data-id="a"] .carte-visuel')).toBeNull();
    expect(el.querySelector('.carte[data-id="a"] .carte-accroche').textContent).toBe('Sans image');
  });

  it('une frappe dans une fiche réutilise le même nœud image : pas de rechargement', () => {
    const cache = creerCacheVisuels();
    const actions = avecUrls();
    const fiche = reel('a', '2026-09-29T10:00:00.000Z', { visuel: 'a.png', visuel_type: 'image', accroche: 'Première' });
    const premiere = vueSemaine(etat([fiche], undefined, { cacheVisuels: cache }), actions);
    const img = premiere.querySelector('img');
    const seconde = vueSemaine(etat([{ ...fiche, accroche: 'Frappée' }], undefined, { cacheVisuels: cache }), actions);
    expect(seconde.querySelector('img')).toBe(img);
    expect(actions.urlVisuel).toHaveBeenCalledTimes(1);
  });

  it('au changement de semaine, la fiche reçoit un nouveau nœud image', () => {
    const cache = creerCacheVisuels();
    const actions = avecUrls();
    const premiere = vueSemaine(etat([reel('a', '2026-09-29T10:00:00.000Z', { visuel: 'a.png', visuel_type: 'image' })], undefined, { cacheVisuels: cache }), actions);
    const img = premiere.querySelector('img');
    const suivante = vueSemaine({ ...etat([reel('a', '2026-10-06T10:00:00.000Z', { visuel: 'a.png', visuel_type: 'image' })], undefined, { cacheVisuels: cache }), ancre: DEBUT_SUIVANT }, actions);
    expect(suivante.querySelector('img')).not.toBe(img);
  });

  it('changer le filtre dans l’état reconstruit la vue Semaine (rendu)', () => {
    const racine = document.createElement('div');
    const actions = avecUrls({ changerVue: vi.fn(), naviguer: vi.fn(), allerAujourdhui: vi.fn(), changerFiltresApercu: vi.fn() });
    const rendre = creerRendu(racine, actions, {}, () => ANCRE);
    const fiches = [story('s', '2026-09-29T10:00:00.000Z'), reel('r', '2026-09-30T10:00:00.000Z')];
    const e = { profil: fictif, fiches, vue: 'semaine', ancre: ANCRE, apercu: { periode: 'semaine', filtres: TOUS }, sauvegarde: 'ok', erreur: null, ficheOuverte: null };
    rendre(e);
    expect(racine.querySelector('.carte[data-id="s"]')).not.toBeNull();
    rendre({ ...e, apercu: sansStory });
    expect(racine.querySelector('.carte[data-id="s"]')).toBeNull();
    expect(racine.querySelector('.carte[data-id="r"]')).not.toBeNull();
  });

  it('le cache créé par visuels.js (C4) garde le même nœud image d’une reconstruction', () => {
    const cache = creerCacheDeVisuels();
    const actions = avecUrls();
    const fiche = reel('a', '2026-09-29T10:00:00.000Z', { visuel: 'a.png', visuel_type: 'image' });
    const premiere = vueSemaine(etat([fiche], undefined, { cacheVisuels: cache }), actions);
    const img = premiere.querySelector('img');
    const seconde = vueSemaine(etat([{ ...fiche, accroche: 'autre' }], undefined, { cacheVisuels: cache }), actions);
    expect(seconde.querySelector('img')).toBe(img);
  });
});

describe('volets de la Semaine : état gardé d’une reconstruction', () => {
  const M = '2026-09-30T08:00:00.000Z';
  const TOUS = { story: true, reel: true, post: true };
  const e0 = (fiches, extra = {}) => ({ profil: fictif, fiches, vue: 'semaine', ancre: ANCRE, apercu: { periode: 'semaine', filtres: TOUS }, sauvegarde: 'ok', erreur: null, ficheOuverte: null, ...extra });
  afterEach(() => { document.body.replaceChildren(); });
  const montee = () => {
    const racine = document.createElement('div');
    // Attachée au document : le navigateur ne rapporte un choix que pour un volet connecté.
    document.body.append(racine);
    const actions = { ...actionsFactices(), changerVue: vi.fn(), naviguer: vi.fn(), allerAujourdhui: vi.fn(), changerFiltresApercu: vi.fn() };
    return { racine, rendre: creerRendu(racine, actions, {}, () => M) };
  };
  // Simule l’utilisatrice qui ouvre ou ferme un volet : le navigateur met open à jour puis émet toggle.
  const bascule = (d, ouvert) => { d.open = ouvert; d.dispatchEvent(new Event('toggle')); };

  it('« Tout voir » ouvert par l’utilisatrice reste ouvert quand une fiche change', () => {
    const { racine, rendre } = montee();
    const fiche = reel('a', '2026-10-01T10:00:00.000Z');
    rendre(e0([fiche, ...storiesVertes()]));
    expect(racine.querySelector('details.bandeau-detail').open).toBe(false);
    bascule(racine.querySelector('details.bandeau-detail'), true);
    rendre(e0([{ ...fiche, caption: 'Frappée' }, ...storiesVertes()]));
    expect(racine.querySelector('details.bandeau-detail').open).toBe(true);
  });

  it('« À faire » fermé par l’utilisatrice reste fermé malgré un retard', () => {
    const { racine, rendre } = montee();
    const fiche = reel('a', '2026-09-29T10:00:00.000Z');
    rendre(e0([fiche], { stats: [] }));
    expect(racine.querySelector('details.a-faire').open).toBe(true);
    bascule(racine.querySelector('details.a-faire'), false);
    rendre(e0([{ ...fiche, accroche: 'Frappée' }], { stats: [] }));
    expect(racine.querySelector('details.a-faire').open).toBe(false);
  });

  it('une ouverture posée à la construction (retard) n’enregistre pas de choix', () => {
    const { racine, rendre } = montee();
    rendre(e0([reel('a', '2026-09-29T10:00:00.000Z')], { stats: [] }));
    // Le navigateur émet toggle sans que l’utilisatrice ait rien changé : open reste ouvert, comme attendu.
    racine.querySelector('details.a-faire').dispatchEvent(new Event('toggle'));
    rendre(e0([reel('b', '2026-10-02T10:00:00.000Z')], { stats: [] }));
    expect(racine.querySelector('details.a-faire').open).toBe(false);
  });

  it('un volet détaché ne note aucun choix', () => {
    const volets = new Map();
    const M = '2026-09-30T08:00:00.000Z';
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-29T10:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [], volets }, actionsFactices());
    const d = el.querySelector('details.a-faire');
    d.open = false;
    d.dispatchEvent(new Event('toggle'));
    expect(volets.has('a-faire')).toBe(false);
    const tout = vueSemaine({ profil: fictif, fiches: [reel('b', '2026-10-01T10:00:00.000Z'), ...storiesVertes()], ancre: ANCRE, volets }, actionsFactices());
    const bandeau = tout.querySelector('details.bandeau-detail');
    bandeau.open = true;
    bandeau.dispatchEvent(new Event('toggle'));
    expect(volets.has('bandeau-detail')).toBe(false);
  });

  it('« À faire » sans choix enregistré : fermé sans retard', () => {
    const { racine, rendre } = montee();
    rendre(e0([reel('b', '2026-10-02T10:00:00.000Z')], { stats: [] }));
    expect(racine.querySelector('details.a-faire').open).toBe(false);
  });

  it('sans volets (vueSemaine seule) : « Tout voir » fermé par défaut', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-10-01T10:00:00.000Z'), ...storiesVertes()], ancre: ANCRE }, actionsFactices());
    expect(el.querySelector('details.bandeau-detail').open).toBe(false);
  });

  it('Semaine ne se reconstruit pas quand seul le bulletin change ; l’onglet Bulletin, lui, se reconstruit', () => {
    const { racine, rendre } = montee();
    const e = e0([reel('a', '2026-10-01T10:00:00.000Z')]);
    rendre({ ...e, bulletin: undefined });
    const semaine = racine.querySelector('.semaine');
    rendre({ ...e, bulletin: null });
    expect(racine.querySelector('.semaine')).toBe(semaine);
    const bulletin = { ...e, vue: 'bulletin', bulletin: undefined };
    rendre(bulletin);
    rendre({ ...bulletin, bulletin: null });
    expect(racine.querySelector('.sans-bulletin')).not.toBeNull();
  });
});

describe('carte : heure de Paris et caption (fiche allégée)', () => {
  const actions = { ouvrirFiche: () => {} };
  const regles = fictif.regles_studio;
  const reelA = (extra = {}) => ({ ...nouvelleFiche({ id: 'a', format: 'reel', date_heure: '2026-10-13T16:00:00.000Z', maintenant: 'x' }), ...extra });
  it('ajoute « 18:00 FR » après l’heure locale quand le fuseau n’est pas Paris', () => {
    const el = carte(reelA(), { ...regles, fuseau: 'America/Toronto' }, actions);
    expect(el.querySelector('.carte-tete').textContent).toBe('Reel · 12:00 · 18:00 FR');
  });
  it('rien de plus quand le fuseau est Paris', () => {
    expect(carte(reelA(), regles, actions).querySelector('.carte-tete').textContent).toBe('Reel · 18:00');
  });
  it('montre la première ligne de la caption, « Sans caption » sinon, sans l’accroche', () => {
    expect(carte(reelA({ accroche: 'Ancienne', caption: '  Première\nSeconde' }), regles, actions).querySelector('.carte-accroche').textContent).toBe('Première');
    expect(carte(reelA({ accroche: 'Ancienne' }), regles, actions).querySelector('.carte-accroche').textContent).toBe('Sans caption');
  });
});
