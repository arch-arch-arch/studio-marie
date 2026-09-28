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
});
