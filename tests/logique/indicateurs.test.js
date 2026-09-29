import { describe, it, expect } from 'vitest';
import {
  RELEVES, validerReleveContenu, validerReleveCompte, tauxAbonnesParVue, idReleve, etatReleves,
  documentReleveContenu, documentReleveCompte, formaterValeur,
} from '../../src/logique/indicateurs.js';

const publiee = { id: 'f1', statut: 'publie', date_heure: '2026-09-20T10:00:00.000Z', format: 'reel', pilier: 'socio', accroche: 'Accroche', score: { total: 72 } };

describe('validerReleveContenu', () => {
  it('accepte des entiers, des textes avec espaces et des champs facultatifs vides', () => {
    const r = validerReleveContenu({ vues: '12 345', nouveaux_abonnes: 40, partages_envois: '7', sauvegardes: '', visites_profil: null });
    expect(r).toEqual({ ok: true, erreurs: [], valeurs: { vues: 12345, nouveaux_abonnes: 40, partages_envois: 7, sauvegardes: null, visites_profil: null, clics_porte: null } });
  });
  it('accepte l’espace insécable et l’espace fine', () => {
    const r = validerReleveContenu({ vues: '1\u00A0000', nouveaux_abonnes: '2\u202F000', partages_envois: 0 });
    expect(r.valeurs.vues).toBe(1000);
    expect(r.valeurs.nouveaux_abonnes).toBe(2000);
  });
  it('refuse un champ requis vide, un négatif, un décimal et du texte', () => {
    const r = validerReleveContenu({ vues: '', nouveaux_abonnes: -1, partages_envois: '2,5', sauvegardes: 'beaucoup' });
    expect(r.ok).toBe(false);
    expect(r.erreurs).toEqual([
      'Vues : valeur requise.',
      'Nouveaux abonnés : nombre entier positif attendu.',
      'Partages et envois : nombre entier positif attendu.',
      'Sauvegardes : nombre entier positif attendu.',
    ]);
  });
});

describe('validerReleveCompte', () => {
  it('exige le nombre d’abonnés', () => {
    expect(validerReleveCompte({ abonnes: '' }).erreurs).toEqual(['Abonnés : valeur requise.']);
    expect(validerReleveCompte({ abonnes: '15000', vues_moyennes_stories: '900' }).valeurs)
      .toEqual({ abonnes: 15000, vues_moyennes_stories: 900, clics_porte: null });
  });
});

describe('tauxAbonnesParVue', () => {
  it('divise les nouveaux abonnés par les vues', () => {
    expect(tauxAbonnesParVue({ vues: 1000, nouveaux_abonnes: 3 })).toBeCloseTo(0.003);
  });
  it('renvoie null sans vues ou sans relevé', () => {
    expect(tauxAbonnesParVue({ vues: 0, nouveaux_abonnes: 3 })).toBeNull();
    expect(tauxAbonnesParVue(null)).toBeNull();
    expect(tauxAbonnesParVue(undefined)).toBeNull();
  });
});

describe('etatReleves', () => {
  it('signale les relevés dus et non saisis', () => {
    const e = etatReleves(publiee, [], '2026-09-23T10:00:00.000Z');
    expect(e['48h']).toEqual({ du_le: '2026-09-22T10:00:00.000Z', etat: 'a_saisir' });
    expect(e['7j']).toEqual({ du_le: '2026-09-27T10:00:00.000Z', etat: 'pas_encore' });
    expect(e.enRetard).toBe(true);
  });
  it('un relevé saisi n’est plus en retard', () => {
    const e = etatReleves(publiee, [{ releve: '48h' }], '2026-09-23T10:00:00.000Z');
    expect(e['48h'].etat).toBe('saisi');
    expect(e.enRetard).toBe(false);
  });
  it('une fiche non publiée n’est jamais en retard', () => {
    expect(etatReleves({ ...publiee, statut: 'programme' }, [], '2026-10-30T10:00:00.000Z').enRetard).toBe(false);
  });
  it('l’échéance est atteinte pile à 48 h', () => {
    expect(etatReleves(publiee, [], '2026-09-22T10:00:00.000Z')['48h'].etat).toBe('a_saisir');
  });
});

describe('documents', () => {
  it('le relevé de contenu recopie ce qu’il faut de la fiche', () => {
    const v = validerReleveContenu({ vues: 1000, nouveaux_abonnes: 3, partages_envois: 12 }).valeurs;
    expect(documentReleveContenu(publiee, '7j', v, '2026-09-27T12:00:00.000Z')).toEqual({
      id: 'f1_7j', fiche: 'f1', releve: '7j', ...v, saisi_le: '2026-09-27T12:00:00.000Z',
      date_publication: '2026-09-20T10:00:00.000Z', format: 'reel', pilier: 'socio', accroche: 'Accroche', score_total: 72,
    });
    expect(idReleve('f1', '48h')).toBe('f1_48h');
    expect(RELEVES).toEqual(['48h', '7j']);
  });
  it('score_total vaut null pour une fiche non évaluée', () => {
    const v = validerReleveContenu({ vues: 1, nouveaux_abonnes: 0, partages_envois: 0 }).valeurs;
    expect(documentReleveContenu({ ...publiee, score: null }, '48h', v, 'x').score_total).toBeNull();
  });
  it('le relevé du compte porte la clé de semaine ISO', () => {
    const doc = documentReleveCompte('2026-09-27T22:00:00.000Z', 'Europe/Paris', { abonnes: 100, vues_moyennes_stories: null, clics_porte: null }, 'x');
    expect(doc).toEqual({ id: '2026-W40', semaine: '2026-W40', debut: '2026-09-27T22:00:00.000Z', abonnes: 100, vues_moyennes_stories: null, clics_porte: null, saisi_le: 'x' });
  });
});

describe('formaterValeur', () => {
  it('affiche un taux en pourcentage et le reste en entier', () => {
    expect(formaterValeur('taux_abonnes_par_vue', 0.0042)).toBe('0,42 %');
    expect(formaterValeur('partages_par_post', 12.4)).toBe('12');
    expect(formaterValeur('croissance_nette_semaine', null)).toBe('—');
  });
});
