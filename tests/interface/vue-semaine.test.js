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
    expect(el.querySelectorAll('.bandeau .pastille')).toHaveLength(8);
    expect([...el.querySelectorAll('.jour')].map(j => j.dataset.jour)).toEqual(['2026-09-28', '2026-09-29', '2026-09-30', '2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04']);
  });

  it('place une carte dans la bonne colonne et l’ouvre au clic', () => {
    const actions = actionsFactices();
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-10-01T16:00:00.000Z', { accroche: 'Ma phrase' })], ancre: ANCRE }, actions);
    const colonne = el.querySelector('[data-jour="2026-10-01"]');
    const c = colonne.querySelector('.carte');
    expect(c.textContent).toContain('Ma phrase');
    expect(c.textContent).toContain('18:00');
    expect(c.style.getPropertyValue('--pilier')).toBe('#0b8574');
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

describe('parcours dans la semaine', () => {
  const M = '2026-09-30T08:00:00.000Z';
  it('affiche la prochaine action sur chaque carte, en retard si besoin', () => {
    const el = vueSemaine({ profil: fictif, fiches: [reel('a', '2026-09-29T10:00:00.000Z'), reel('b', '2026-10-02T10:00:00.000Z')], ancre: ANCRE, maintenant: M, stats: [] }, actionsFactices());
    const a = el.querySelector('.carte[data-id="a"] .carte-action');
    expect(a.textContent).toBe('Terminer : ajoute un visuel et une caption');
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
  it('propose le bouton quand la capacité existe', () => {
    const a = { ...actionsFactices(), ouvrirAnalyse: vi.fn() };
    bouton(vueSemaine(etat(), a, { dossier: true })).click();
    expect(a.ouvrirAnalyse).toHaveBeenCalled();
    expect(bouton(vueSemaine(etat(), a, {}))).toBeUndefined();
    expect(bouton(vueSemaine(etat(), a))).toBeUndefined();
  });
  it('désactive le bouton pendant la préparation', () => {
    const a = { ...actionsFactices(), ouvrirAnalyse: vi.fn() };
    expect(bouton(vueSemaine(etat({ analyse: { etape: 'preparation' } }), a, { dossier: true })).disabled).toBe(true);
    expect(bouton(vueSemaine(etat({ analyse: { etape: 'pret' } }), a, { dossier: true })).disabled).toBe(false);
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
