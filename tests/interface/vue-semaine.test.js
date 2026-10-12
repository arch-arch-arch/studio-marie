// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche, empreinte } from '../../src/logique/fiche.js';
import { vueSemaine } from '../../src/interface/vue-semaine.js';

const ANCRE = '2026-09-30T10:00:00.000Z';
const actionsFactices = () => ({ ouvrirFiche: vi.fn(), creerFiche: vi.fn(), deplacerFiche: vi.fn() });
const reel = (id, date_heure, extra = {}) => ({ ...nouvelleFiche({ id, format: 'reel', date_heure, pilier: 'nuit', maintenant: ANCRE }), ...extra });

describe('vueSemaine', () => {
  it('affiche le bandeau et 7 colonnes', () => {
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE }, actionsFactices());
    expect(el.querySelectorAll('.bandeau .pastille')).toHaveLength(15);
    expect([...el.querySelectorAll('.jour')].map(j => j.dataset.jour)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  });

  it('place une carte dans la bonne colonne et l’ouvre au clic', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-10-01T16:00:00.000Z', { accroche: 'Ma phrase' })], ancre: ANCRE }, actions);
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
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE }, actionsFactices());
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

  it('signale l’absence de bulletin et mène à l’onglet Bulletin', () => {
    const actions = { ...actionsFactices(), changerVue: vi.fn() };
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE, bulletin: null }, actions);
    expect(el.querySelector('.sans-bulletin').textContent).toContain('Pas de bulletin pour cette semaine.');
    [...el.querySelectorAll('button')].find(b => b.textContent === 'Voir l’onglet Bulletin').click();
    expect(actions.changerVue).toHaveBeenCalledWith('bulletin');
    expect(vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE, bulletin: undefined }, actionsFactices()).querySelector('.sans-bulletin')).toBeNull();
  });

  it('n’affiche pas le bandeau sans bulletin pour une semaine déjà passée', () => {
    const semainePassee = '2026-09-02T10:00:00.000Z';
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: semainePassee, maintenant: ANCRE, bulletin: null }, actionsFactices());
    expect(el.querySelector('.sans-bulletin')).toBeNull();
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

  it('le nom du pilier reste écrit sur la carte', () => {
    const el = vueSemaine({ profil: fictif, fiches: [jour('a', '10', { categorie: 'desir' })], ancre: ANCRE }, actionsFactices());
    expect(el.querySelector('.carte[data-id="a"]').textContent).toContain('Nuit');
  });

  it('ajoute une pastille par cible après les pastilles existantes, nom seul en libellé', () => {
    const el = vueSemaine({ profil: fictif, fiches: [jour('a', '10', { categorie: 'attraction' })], ancre: ANCRE }, actionsFactices());
    const pastilles = [...el.querySelectorAll('.bandeau .pastille')].map(p => [p.children[0].textContent, p.children[1].textContent]);
    expect(pastilles).toHaveLength(15);
    expect(pastilles.slice(8)).toEqual([
      ['Attraction', '1 sur 3 contenus du fil'],
      ['Autorité', '0 sur 2 contenus du fil'],
      ['Connexion', '0 story, objectif 3 à 5'],
      ['Désir', '0 sur 1 contenu du fil'],
      ['Preuve', '0 sur 1 contenu du fil'],
      ['Conversion', '0 sur 1 contenu du fil'],
      ['Conversion', '0 story, objectif 2 à 3'],
    ]);
  });

  it('légende « Catégories » sous le contrôle, avec les six noms et les couleurs du profil', () => {
    const el = vueSemaine({ profil: fictif, fiches: [], ancre: ANCRE }, actionsFactices());
    const legende = el.querySelector('.legende-categories');
    expect(legende.textContent).toContain('Catégories');
    for (const nom of NOMS) expect(legende.textContent).toContain(nom);
    expect(legende.querySelector('[data-categorie="attraction"]').style.getPropertyValue('--categorie')).toBe('#d9622b');
    expect(legende.querySelector('[data-categorie="desir"]').style.getPropertyValue('--categorie')).toBe('#b3125a');
    expect(el.querySelector('.bandeau').nextElementSibling).toBe(legende);
  });

  it('profil sans section : ni pastille ni légende quand aucune fiche de la semaine n’est rangée', () => {
    const sans = structuredClone(fictif);
    delete sans.categories_de_contenu;
    const el = vueSemaine({ profil: sans, fiches: [jour('a', '10')], ancre: ANCRE }, actionsFactices());
    expect(el.querySelectorAll('.bandeau .pastille')).toHaveLength(8);
    expect(el.querySelector('.legende-categories')).toBeNull();
  });

  it('profil sans section : la légende apparaît dès qu’une fiche de la semaine a une catégorie choisie', () => {
    const sans = structuredClone(fictif);
    delete sans.categories_de_contenu;
    const el = vueSemaine({ profil: sans, fiches: [jour('a', '10', { categorie: 'desir' })], ancre: ANCRE }, actionsFactices());
    const legende = el.querySelector('.legende-categories');
    expect(legende).not.toBeNull();
    expect(legende.querySelector('[data-categorie="desir"]')).not.toBeNull();
    expect(el.querySelectorAll('.bandeau .pastille')).toHaveLength(8);
  });
});

describe('parcours dans la semaine', () => {
  const M = '2026-09-30T08:00:00.000Z';
  it('affiche la prochaine action sur chaque carte, en retard si besoin', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-29T10:00:00.000Z'), reel('b', '2026-10-02T10:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    const a = el.querySelector('.carte[data-id="a"] .carte-action');
    expect(a.textContent).toBe('Valider la fiche');
    expect(a.classList.contains('action-retard')).toBe(true);
    expect(el.querySelector('.carte[data-id="b"] .carte-action').classList.contains('action-retard')).toBe(false);
  });

  it('liste « À faire cette semaine », retards d’abord, et ouvre la fiche', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [reel('b', '2026-10-02T10:00:00.000Z', { accroche: 'Plus tard' }), reel('a', '2026-09-29T10:00:00.000Z', { accroche: 'En retard' })], ancre: ANCRE, maintenant: M, stats: [] }, actions);
    const lignes = [...el.querySelectorAll('.a-faire li')];
    expect(lignes.map(l => l.textContent.includes('En retard'))).toEqual([true, false]);
    expect(lignes[0].classList.contains('action-retard')).toBe(true);
    const bouton = [...lignes[0].querySelectorAll('button')].find(b => b.textContent === 'Ouvrir');
    expect(bouton.getAttribute('aria-label')).toBe('Ouvrir « En retard »');
    bouton.click();
    expect(actions.ouvrirFiche).toHaveBeenCalledWith('a');
  });

  it('n’inclut pas les fiches sans action et affiche un message si rien n’est à faire', () => {
    const f = reel('p', '2026-09-29T10:00:00.000Z', { statut: 'publie', publie_le: '2026-09-29T10:00:00.000Z' });
    const el = vueSemaine({ profil: fictif, fiches: [f], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    expect(el.querySelector('.a-faire').textContent).toContain('Rien à faire cette semaine.');
    expect(el.querySelector('.carte[data-id="p"] .carte-action').classList.contains('action-calme')).toBe(true);
  });

  it('les relevés de l’état comptent pour les fiches publiées', () => {
    const f = reel('p', '2026-09-28T06:00:00.000Z', { statut: 'publie', publie_le: '2026-09-28T06:00:00.000Z' });
    const sans = vueSemaine({ profil: fictif, fiches: [f], ancre: ANCRE, maintenant: '2026-10-01T08:00:00.000Z', stats: [] }, actionsFactices());
    expect(sans.querySelector('.carte-action').textContent).toBe('Saisir les stats à 48 h');
    const avec = vueSemaine({ profil: fictif, fiches: [f], ancre: ANCRE, maintenant: '2026-10-01T08:00:00.000Z', stats: [{ fiche: 'p', releve: '48h' }] }, actionsFactices());
    expect(avec.querySelector('.carte-action').textContent).toContain('Prochain relevé le');
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
