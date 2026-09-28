import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { creerEnregistreur } from '../../src/donnees/enregistreur.js';

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

const differe = () => { let resoudre; const p = new Promise(r => { resoudre = r; }); return { p, resoudre }; };

describe('creerEnregistreur', () => {
  it('regroupe une saisie rapide en une seule écriture de la dernière valeur', async () => {
    const enregistrer = vi.fn(async () => {});
    const e = creerEnregistreur(enregistrer, 600);
    for (const t of ['a', 'ab', 'abc']) e.planifier({ id: 'f1', accroche: t });
    expect(e.estEnAttente('f1')).toBe(true);
    await vi.advanceTimersByTimeAsync(600);
    expect(enregistrer).toHaveBeenCalledTimes(1);
    expect(enregistrer).toHaveBeenCalledWith({ id: 'f1', accroche: 'abc' });
    expect(e.estEnAttente('f1')).toBe(false);
  });

  it('n’écrit jamais deux fois en même temps pour une fiche, et finit par la plus récente', async () => {
    const premiere = differe();
    const appels = [];
    const enregistrer = vi.fn(f => { appels.push(f.accroche); return appels.length === 1 ? premiere.p : Promise.resolve(); });
    const e = creerEnregistreur(enregistrer, 600);
    e.planifier({ id: 'f1', accroche: 'v1' });
    await vi.advanceTimersByTimeAsync(600);
    e.planifier({ id: 'f1', accroche: 'v2' });
    await vi.advanceTimersByTimeAsync(600);
    expect(appels).toEqual(['v1']);
    expect(e.estEnAttente('f1')).toBe(true);
    premiere.resoudre();
    await vi.advanceTimersByTimeAsync(0);
    expect(appels).toEqual(['v1', 'v2']);
  });

  it('vider écrit tout de suite, sans attendre le délai', async () => {
    const enregistrer = vi.fn(async () => {});
    const e = creerEnregistreur(enregistrer, 600);
    e.planifier({ id: 'f1', accroche: 'x' });
    await e.vider('f1');
    expect(enregistrer).toHaveBeenCalledWith({ id: 'f1', accroche: 'x' });
  });

  it('annuler abandonne l’écriture en attente', async () => {
    const enregistrer = vi.fn(async () => {});
    const e = creerEnregistreur(enregistrer, 600);
    e.planifier({ id: 'f1', accroche: 'x' });
    await e.annuler('f1');
    await vi.advanceTimersByTimeAsync(600);
    expect(enregistrer).not.toHaveBeenCalled();
    expect(e.estEnAttente('f1')).toBe(false);
  });

  it('signale un échec et retente à la prochaine vidange', async () => {
    const surErreur = vi.fn();
    const enregistrer = vi.fn().mockRejectedValueOnce({ code: 'unavailable' }).mockResolvedValue();
    const e = creerEnregistreur(enregistrer, 600, surErreur);
    e.planifier({ id: 'f1', accroche: 'x' });
    await e.vider('f1');
    expect(surErreur).toHaveBeenCalledWith({ code: 'unavailable' }, { id: 'f1', accroche: 'x' });
    expect(e.estEnAttente('f1')).toBe(true);
    await e.vider('f1');
    expect(enregistrer).toHaveBeenCalledTimes(2);
    expect(e.estEnAttente('f1')).toBe(false);
  });

  it('viderTout vide toutes les fiches', async () => {
    const enregistrer = vi.fn(async () => {});
    const e = creerEnregistreur(enregistrer, 600);
    e.planifier({ id: 'a' });
    e.planifier({ id: 'b' });
    await e.viderTout();
    expect(enregistrer).toHaveBeenCalledTimes(2);
  });

  it('une annulation pendant une écriture qui échoue ne remet rien en file', async () => {
    const vol = differe();
    const enregistrer = vi.fn(() => vol.p);
    const e = creerEnregistreur(enregistrer, 600);
    e.planifier({ id: 'f1', accroche: 'v1' });
    const vidange = e.vider('f1');
    await vi.advanceTimersByTimeAsync(0);
    const annulation = e.annuler('f1');
    vol.p.catch(() => {});
    vol.resoudre(Promise.reject({ code: 'unavailable' }));
    await vidange; await annulation;
    expect(e.estEnAttente('f1')).toBe(false);
    await e.viderTout();
    expect(enregistrer).toHaveBeenCalledTimes(1);
  });

  it('un surErreur qui lève ne bloque pas les écritures suivantes', async () => {
    const enregistrer = vi.fn().mockRejectedValueOnce({ code: 'unavailable' }).mockResolvedValue();
    const e = creerEnregistreur(enregistrer, 600, () => { throw new Error('affichage cassé'); });
    e.planifier({ id: 'f1', accroche: 'v1' });
    await e.vider('f1');
    e.planifier({ id: 'f1', accroche: 'v2' });
    await e.vider('f1');
    expect(enregistrer).toHaveBeenLastCalledWith({ id: 'f1', accroche: 'v2' });
    expect(e.estEnAttente('f1')).toBe(false);
  });
});
