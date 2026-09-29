// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { vueBulletin } from '../../src/interface/vue-bulletin.js';

const ANCRE = '2026-10-06T10:00:00.000Z';
const idee = { ...nouvelleFiche({ id: 'i1', format: 'reel', date_heure: '2026-10-05T10:00:00.000Z', pilier: 'nuit', maintenant: 'x' }), accroche: 'Idée de la veille' };
const bulletin = extra => ({
  semaine: '2026-W41', genere_le: '2026-10-04T18:00:00.000Z', statut: 'complet', sources_indisponibles: false,
  retrospective: { type: 'rappel', texte: 'Aucun relevé de statistiques pour la semaine écoulée : saisis-les pour obtenir la rétrospective.' },
  tendances: [{ titre: 'Tendance A', source: 'https://exemple.test/a', date: '2026-10-01', pourquoi: 'Colle à la voix.', adaptation: 'En fausse annonce.', duree_vie: '2 semaines', son_a_verifier: true }],
  ecartees: [{ titre: 'Tendance B', raison: 'Trop cozy.' }],
  alertes: [{ texte: 'Nouveau format.', proposition_profil: 'Ajouter les Reels longs.' }],
  idees: ['i1', 'disparue'], hors_creneau: [], controle: [],
  ...extra,
});
const etat = extra => ({ profil: fictif, fiches: [idee], ancre: ANCRE, bulletin: bulletin(), configVeille: { url_routine: 'https://exemple.test/routine' }, ...extra });
const actions = () => ({ ouvrirFiche: vi.fn(), changerVue: vi.fn() });

describe('vueBulletin', () => {
  it('affiche le rappel, les tendances, les écartées, les alertes et les idées', () => {
    const a = actions();
    const el = vueBulletin(etat(), a);
    const t = el.textContent;
    for (const attendu of ['Semaine 2026-W41', 'Aucun relevé de statistiques', 'Tendance A', 'Son à vérifier dans l’app', 'Tendance B', 'Trop cozy.', 'Nouveau format.', 'Proposition de mise à jour du profil : Ajouter les Reels longs.', 'Idée de la veille', 'Idée supprimée ou hors de cette semaine.']) {
      expect(t).toContain(attendu);
    }
    const lien = el.querySelector('a[href="https://exemple.test/a"]');
    expect(lien.target).toBe('_blank');
    [...el.querySelectorAll('button')].find(b => b.textContent === 'Ouvrir').click();
    expect(a.ouvrirFiche).toHaveBeenCalledWith('i1');
  });
  it('signale un bulletin partiel', () => {
    const el = vueBulletin(etat({ bulletin: bulletin({ statut: 'partiel', sources_indisponibles: true, tendances: [] }) }), actions());
    expect(el.textContent).toContain('Sources indisponibles : bulletin partiel.');
  });
  it('sans bulletin : message et lien de relance, ou veille non configurée', () => {
    const avec = vueBulletin(etat({ bulletin: null }), actions());
    expect(avec.textContent).toContain('Pas de bulletin pour cette semaine.');
    expect(avec.querySelector('a[href="https://exemple.test/routine"]').textContent).toBe('Relancer la veille');
    const sans = vueBulletin(etat({ bulletin: null, configVeille: null }), actions());
    expect(sans.textContent).toContain('La veille n’est pas encore configurée.');
  });
  it('pendant le chargement', () => {
    expect(vueBulletin(etat({ bulletin: undefined }), actions()).textContent).toContain('Chargement du bulletin…');
  });
  it('un bulletin mal formé, sans tendances ni idées, s’affiche sans erreur', () => {
    const b = bulletin();
    delete b.tendances;
    delete b.idees;
    expect(() => vueBulletin(etat({ bulletin: b }), actions())).not.toThrow();
    const el = vueBulletin(etat({ bulletin: b }), actions());
    expect(el.textContent).toContain('Aucune tendance retenue cette semaine.');
  });
  it('n’affiche pas de lien de relance pour une url_routine qui n’est pas en https', () => {
    const el = vueBulletin(etat({ bulletin: null, configVeille: { url_routine: 'javascript:alert(1)' } }), actions());
    expect(el.querySelector('a')).toBeNull();
    expect(el.textContent).toContain('La veille n’est pas encore configurée.');
  });
  it('affiche une rétrospective avec bilan', () => {
    const b = bulletin();
    b.retrospective = {
      type: 'bilan', texte: '2 contenus relevés sur les 2 dernières semaines.',
      meilleur: { fiche: 'a', accroche: 'Le meilleur', format: 'reel', taux: 0.009, partages_envois: 30 },
      pire: { fiche: 'b', accroche: 'Le pire', format: 'reel', taux: 0.001, partages_envois: 2 },
      ecarts: [{ indicateur: 'croissance_nette_semaine', libelle: 'Croissance nette de la semaine', valeur: 80, cible: 100, atteinte: false }],
      manquants: [{ fiche: 'c', releve: '48h', accroche: 'Oubliée' }],
    };
    const el = vueBulletin(etat({ bulletin: b }), actions());
    expect(el.textContent).toContain('Meilleur contenu : « Le meilleur » (0,9 % d’abonnés par vue, 30 partages et envois).');
    expect(el.textContent).toContain('Croissance nette de la semaine : 80 pour une cible de 100 (en dessous).');
    expect(el.textContent).toContain('Relevés manquants : Oubliée (48 h).');
  });
});
