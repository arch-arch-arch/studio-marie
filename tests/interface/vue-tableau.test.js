// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { vueTableau } from '../../src/interface/vue-tableau.js';

const MAINTENANT = '2026-09-29T08:00:00.000Z';
const stat = (fiche, extra = {}) => ({ id: `${fiche}_7j`, fiche, releve: '7j', vues: 1000, nouveaux_abonnes: 3, partages_envois: 10, date_publication: '2026-09-15T10:00:00.000Z', format: 'reel', pilier: 'socio', accroche: `Accroche ${fiche}`, score_total: 70, ...extra });
const actions = () => ({ enregistrerReleveCompte: vi.fn(async () => ({ ok: true, erreurs: [], releve: {} })), allerAFiche: vi.fn() });
const etat = extra => ({ profil: fictif, stats: [stat('a'), stat('b', { nouveaux_abonnes: 1 })], relevesCompte: [], fichesRecentes: [], maintenant: MAINTENANT, ...extra });

describe('vueTableau', () => {
  it('attend les données', () => {
    expect(vueTableau(etat({ stats: undefined }), actions()).textContent).toContain('Chargement du tableau de bord…');
  });
  it('affiche les six graphiques et le classement', () => {
    const v = vueTableau(etat({ stats: ['a', 'b', 'c', 'd', 'e'].map((id, i) => stat(id, { nouveaux_abonnes: i + 1 })) }), actions());
    expect([...v.querySelectorAll('figcaption')].map(f => f.textContent)).toEqual([
      'Taux d’abonnés par vue des Reels', 'Partages et envois par post', 'Croissance nette hebdomadaire',
      'Clics sur la porte', 'Meilleurs et pires contenus', 'Score prévu / performance réelle',
    ]);
    expect(v.querySelector('.graphique ol')).not.toBeNull();
    expect(v.textContent).toContain('Accroche a');
    expect(v.textContent).not.toContain('null');
  });
  it('fonctionne sans cibles dans le profil', () => {
    const sans = structuredClone(fictif);
    delete sans.regles_studio.cibles;
    const v = vueTableau(etat({ profil: sans }), actions());
    expect(v.querySelector('line.cible')).toBeNull();
  });
  it('liste les relevés à saisir et ouvre la fiche', () => {
    const f = { id: 'p1', statut: 'publie', date_heure: '2026-09-25T10:00:00.000Z', format: 'reel', accroche: 'Publiée' };
    const a = actions();
    const v = vueTableau(etat({ fichesRecentes: [f] }), a);
    expect(v.querySelector('.a-saisir').textContent).toContain('Publiée');
    [...v.querySelectorAll('.a-saisir button')].find(b => b.textContent === 'Ouvrir').click();
    expect(a.allerAFiche).toHaveBeenCalledWith('p1', '2026-09-25T10:00:00.000Z');
  });
  it('enregistre le relevé du compte de la semaine choisie', async () => {
    const a = actions();
    const v = vueTableau(etat(), a);
    const form = v.querySelector('form.releve-compte');
    form.querySelector('input[name="abonnes"]').value = '1500';
    form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await vi.waitFor(() => expect(a.enregistrerReleveCompte).toHaveBeenCalled());
    // Semaine en cours au 2026-09-29 (Paris) : lundi 2026-09-28 00:00 locale = 2026-09-27T22:00Z
    expect(a.enregistrerReleveCompte.mock.calls[0][0]).toBe('2026-09-27T22:00:00.000Z');
    expect(a.enregistrerReleveCompte.mock.calls[0][1]).toMatchObject({ abonnes: '1500' });
  });
  it('mettreAJour conserve la saisie en cours et met à jour le classement', () => {
    const v = vueTableau(etat(), actions());
    const input = v.querySelector('input[name="abonnes"]');
    input.value = '999';
    const nouveauxStats = [stat('a'), stat('b', { nouveaux_abonnes: 1 }), stat('c', { accroche: 'Accroche c', nouveaux_abonnes: 50, vues: 100 })];
    v.mettreAJour(etat({ stats: nouveauxStats }));
    expect(v.querySelector('input[name="abonnes"]').value).toBe('999');
    expect(v.textContent).toContain('Accroche c');
  });
});

describe('faible volume', () => {
  const cinq = ['a', 'b', 'c', 'd', 'e'].map((id, i) => stat(id, { nouveaux_abonnes: i + 1 }));
  it('affiche le volume, les tableaux, et masque les comparaisons sous le seuil', () => {
    const v = vueTableau(etat({ stats: cinq.slice(0, 4) }), actions());
    expect(v.querySelector('.volume').textContent).toBe('4 contenus relevés sur 12 semaines (4 Reels).');
    expect(v.querySelectorAll('.resultats-contenus tbody tr')).toHaveLength(4);
    expect(v.querySelectorAll('.resultats-formats tbody tr')).toHaveLength(1);
    expect(v.textContent).toContain('Il faut au moins 5 contenus relevés pour comparer (actuellement 4).');
    expect(v.querySelector('.graphique .point[cx]') ?? null).not.toBeNull();
    expect(v.textContent).not.toContain('NaN');
  });
  it('affiche les comparaisons à partir de 5 contenus', () => {
    const v = vueTableau(etat({ stats: cinq }), actions());
    expect(v.textContent).not.toContain('Il faut au moins 5 contenus relevés');
    expect(v.textContent).toContain('Meilleurs');
  });
  it('place les tableaux avant les graphiques', () => {
    const v = vueTableau(etat({ stats: cinq }), actions());
    const tout = [...v.querySelectorAll('.resultats-contenus, .graphiques')];
    expect(tout[0].classList.contains('resultats-contenus')).toBe(true);
  });
  it('met à jour le volume et les tableaux sans reconstruire la vue', () => {
    const v = vueTableau(etat({ stats: [] }), actions());
    v.mettreAJour({ ...etat({ stats: cinq }) });
    expect(v.querySelector('.volume').textContent).toBe('5 contenus relevés sur 12 semaines (5 Reels).');
    expect(v.querySelectorAll('.resultats-contenus tbody tr')).toHaveLength(5);
  });
});
