import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { depuisSaisieLocale, cleJour, ajouterJours } from '../../src/logique/dates.js';
import { fichesRemplacables, placerIdees, validerEntreeVeille, construireVeille, plageVeille, doitTourner } from '../../src/logique/veille.js';
import entreeFictive from '../../exemples/entree-veille-fictive.json';

const R = fictif.regles_studio;
const LUNDI = '2026-09-27T22:00:00.000Z';
let n = 0;
const fiche = (format, jour, heure, extra = {}) => ({
  ...nouvelleFiche({ id: `v${n++}`, format, date_heure: depuisSaisieLocale(jour, heure, R.fuseau), maintenant: LUNDI }),
  ...extra,
});
const jugement = () => ({
  notes: { accroche: 7, voix: 7, mecanique: 7 }, phrases: { accroche: 'a', voix: 'v', mecanique: 'm' },
  conformite: { etat: 'vert', causes: [] }, captions: [{ role: 'engagement', texte: 'x' }, { role: 'deadpan', texte: 'y' }],
  accroches: ['a1', 'a2'], hashtags: ['nuit'], recommandations: ['1', '2', '3'],
});
const idee = (extra = {}) => ({
  format: 'reel', pilier: 'nuit', role_caption: 'engagement', cta: false, format_valide: '', accroche: 'Une accroche.',
  caption: 'Une caption.', hashtags: ['nuit', 'club', 'paris'], tendance: null, jugement: jugement(), ...extra,
});
const tendance = t => ({ titre: t, source: 'https://exemple.test', date: '2026-09-25', pourquoi: 'p', adaptation: 'a', duree_vie: '2 semaines' });
const entree = (extra = {}) => ({
  sources_indisponibles: false, tendances: [tendance('T1'), tendance('T2'), tendance('T3')], ecartees: [], alertes: [],
  idees: [idee(), idee({ pilier: 'socio' }), idee({ format: 'carrousel', pilier: 'humour_sec' })], ...extra,
});

describe('fichesRemplacables', () => {
  it('ne garde que les idées de ce bulletin, en brouillon et jamais modifiées', () => {
    const cle = '2026-W40';
    const a = fiche('reel', '2026-09-28', '12:00', { statut: 'brouillon', origine: { type: 'veille', bulletin: cle } });
    expect(a.maj_le).toBe(a.cree_le);
    const b = { ...a, id: 'b', modifiee_depuis_creation: true };
    const c = { ...a, id: 'c', statut: 'valide' };
    const d = { ...a, id: 'd', origine: { type: 'veille', bulletin: '2026-W39' } };
    const e = { ...a, id: 'e', origine: { type: 'manuelle' } };
    expect(fichesRemplacables([a, b, c, d, e], cle).map(f => f.id)).toEqual([a.id]);
  });
  it('n’est plus remplaçable une fois validée puis repassée en brouillon (maj_le différent de cree_le)', () => {
    const cle = '2026-W40';
    const a = fiche('reel', '2026-09-28', '12:00', {
      statut: 'brouillon', origine: { type: 'veille', bulletin: cle }, maj_le: '2026-09-29T08:00:00.000Z',
    });
    expect(fichesRemplacables([a], cle)).toEqual([]);
  });
});

describe('placerIdees', () => {
  it('place sur les créneaux libres dans l’ordre, jamais sur un créneau pris', () => {
    const prise = fiche('reel', '2026-09-29', '12:30');
    const r = placerIdees([idee(), idee(), idee()], [prise], R, LUNDI);
    expect(r.map(p => p.date_heure)).toEqual(['2026-09-28T10:00:00.000Z', '2026-10-01T10:00:00.000Z', '2026-09-28T13:00:00.000Z']);
    expect(r.map(p => p.horsCreneau)).toEqual([false, false, true]);
  });
  it('répartit les idées hors créneau sur des jours successifs de la semaine, à l’heure de fin du premier créneau', () => {
    const pleines = ['2026-09-28', '2026-09-29', '2026-10-01'].map(j => fiche('reel', j, '12:00'));
    const r = placerIdees([idee(), idee(), idee()], pleines, R, LUNDI);
    expect(r.map(p => p.horsCreneau)).toEqual([true, true, true]);
    expect(r.map(p => p.date_heure)).toEqual([
      '2026-09-28T13:00:00.000Z',
      '2026-09-29T13:00:00.000Z',
      '2026-09-30T13:00:00.000Z',
    ]);
  });
  it('ne place jamais deux idées ou une idée gardée à la même date_heure, avec des fiches gardées sur les créneaux du profil', () => {
    const gardees = ['2026-09-28', '2026-09-29', '2026-10-01'].map(j => fiche('reel', j, '12:00'));
    const r = placerIdees([idee(), idee()], gardees, R, LUNDI);
    expect(r.every(p => p.horsCreneau)).toBe(true);
    const toutesDates = [...gardees.map(f => f.date_heure), ...r.map(p => p.date_heure)];
    expect(new Set(toutesDates).size).toBe(toutesDates.length);
  });
  it('avance de 30 minutes quand le secours tombe exactement sur une fiche gardée', () => {
    const collision = fiche('reel', '2026-09-28', '15:00');
    const pleines = ['2026-09-28', '2026-09-29', '2026-10-01'].map(j => fiche('reel', j, '12:00'));
    const r = placerIdees([idee()], [...pleines, collision], R, LUNDI);
    expect(r[0].date_heure).toBe(depuisSaisieLocale('2026-09-28', '15:30', R.fuseau));
  });
  it('place les idées du feed avant les idées story, qui ne prennent que les créneaux restants', () => {
    const jeudiPris = fiche('reel', '2026-10-01', '12:00');
    const r = placerIdees([idee({ format: 'story' }), idee(), idee()], [jeudiPris], R, LUNDI);
    expect(r.map(p => p.idee.format)).toEqual(['reel', 'reel', 'story']);
    expect(r.map(p => p.horsCreneau)).toEqual([false, false, true]);
    expect(r.map(p => p.date_heure)).toEqual(['2026-09-28T10:00:00.000Z', '2026-09-29T10:00:00.000Z', '2026-09-28T13:00:00.000Z']);
  });
  it('un candidat de secours antérieur à maintenant passe au jour suivant', () => {
    const MERCREDI_SOIR = '2026-09-30T16:00:00.000Z'; // mercredi 18h Paris : après l’heure de secours (15h)
    const jeudiPris = fiche('reel', '2026-10-01', '12:00'); // seul créneau restant de la semaine, occupé
    const r = placerIdees([idee()], [jeudiPris], R, LUNDI, MERCREDI_SOIR);
    expect(r[0].horsCreneau).toBe(true);
    expect(r[0].date_heure >= MERCREDI_SOIR).toBe(true);
  });
  it('le secours ne dépasse jamais le dimanche de la semaine visée : il reste sur le dernier jour, avec décalage en cas de collision', () => {
    const SAMEDI = '2026-10-03T08:00:00.000Z'; // samedi 10h Paris, dans la semaine visée
    const r = placerIdees([idee(), idee(), idee()], [], R, LUNDI, SAMEDI);
    expect(r.every(p => p.horsCreneau)).toBe(true);
    const dimanche = cleJour(ajouterJours(LUNDI, 6, R.fuseau), R.fuseau);
    expect(r.every(p => cleJour(p.date_heure, R.fuseau) <= dimanche)).toBe(true);
    expect(new Set(r.map(p => p.date_heure)).size).toBe(3);
  });
});

describe('validerEntreeVeille', () => {
  it('accepte une entrée complète et la normalise', () => {
    const r = validerEntreeVeille(entree(), R);
    expect(r.ok).toBe(true);
    expect(r.entree.tendances[0].son_a_verifier).toBe(false);
    expect(r.entree.alertes).toEqual([]);
    expect(r.entree.idees[0].jugement.captions).toHaveLength(2);
  });
  it('accepte zéro tendance seulement si les sources sont indisponibles', () => {
    expect(validerEntreeVeille(entree({ tendances: [] }), R).erreurs).toContain('tendances : 3 à 5 tendances attendues (ou sources_indisponibles à vrai).');
    expect(validerEntreeVeille(entree({ tendances: [], sources_indisponibles: true }), R).ok).toBe(true);
  });
  it('refuse le nombre d’idées hors de 3 à 5, un pilier inconnu, un jugement incomplet', () => {
    expect(validerEntreeVeille(entree({ idees: [idee(), idee()] }), R).erreurs).toContain('idees : 3 à 5 idées attendues.');
    const r = validerEntreeVeille(entree({ idees: [idee({ pilier: 'inconnu' }), idee({ jugement: { notes: {} } }), idee({ format: 'tiktok' })] }), R);
    expect(r.ok).toBe(false);
    expect(r.erreurs).toContain('idees[0].pilier inconnu : inconnu.');
    expect(r.erreurs.some(e => e.startsWith('idees[1].jugement :'))).toBe(true);
    expect(r.erreurs).toContain('idees[2].format inconnu : tiktok.');
  });
  it('refuse ce qui n’est pas un objet', () => {
    expect(validerEntreeVeille([], R)).toEqual({ ok: false, erreurs: ['L’entrée de la veille doit être un objet JSON.'] });
  });
  it('normalise les hashtags comme validerReponse', () => {
    const r = validerEntreeVeille(entree({ idees: [idee({ hashtags: ['#nuit', 'vie nocturne'] }), idee({ pilier: 'socio' }), idee({ format: 'carrousel', pilier: 'humour_sec' })] }), R);
    expect(r.ok).toBe(true);
    expect(r.entree.idees[0].hashtags).toEqual(['nuit', 'vienocturne']);
  });
  it('refuse 6 idées', () => {
    expect(validerEntreeVeille(entree({ idees: [idee(), idee(), idee(), idee(), idee(), idee()] }), R).erreurs).toContain('idees : 3 à 5 idées attendues.');
  });
  it('refuse 6 tendances même avec sources_indisponibles', () => {
    const tendances = [tendance('T1'), tendance('T2'), tendance('T3'), tendance('T4'), tendance('T5'), tendance('T6')];
    expect(validerEntreeVeille(entree({ tendances, sources_indisponibles: true }), R).erreurs).toContain('tendances : 5 au maximum.');
  });
});

describe('construireVeille', () => {
  const MAINTENANT = '2026-10-04T18:00:00.000Z';
  const profil = { ...fictif, version: 2 };
  let k = 0;
  const id = () => `idee-${++k}`;

  it('chaque idée porte un examen sans visuel', () => {
    const r = construireVeille({ profil: { ...fictif, version: 4 }, fiches: [], entree: entree(), maintenant: '2026-09-27T18:00:00.000Z', idAleatoire: () => `ex${n++}` });
    const examen = r.fichesCreees[0].score.examen;
    expect(examen).toMatchObject({ visuel: 'aucun', raison_visuel: null, version_profil: 4, contenus_semaine: 0 });
    expect(examen.sections_profil).toContain('regles_studio');
  });

  it('vise la semaine suivante, dépose des idées évaluées en brouillon et un bulletin', () => {
    const r = construireVeille({ profil, fiches: [], entree: entreeFictive, maintenant: MAINTENANT, idAleatoire: id });
    expect(r.ok).toBe(true);
    expect(r.cle).toBe('2026-W41');
    expect(r.debut).toBe('2026-10-04T22:00:00.000Z');
    expect(r.fichesCreees).toHaveLength(entreeFictive.idees.length);
    for (const f of r.fichesCreees) {
      expect(f).toMatchObject({ statut: 'brouillon', modifiee_depuis_creation: false, origine: { type: 'veille', bulletin: '2026-W41' } });
      expect(f.score.version_profil).toBe(2);
      expect(f.score.total).toBeGreaterThan(0);
      expect(f.variantes).toHaveLength(2);
    }
    expect(r.bulletin).toMatchObject({ semaine: '2026-W41', genere_le: MAINTENANT, statut: 'complet', sources_indisponibles: false });
    expect(r.bulletin.retrospective.type).toBe('rappel');
    expect(r.bulletin.idees).toEqual(r.fichesCreees.map(f => f.id));
    expect(r.bulletin.controle.map(p => p.cle)).toEqual(['reels', 'carrousels', 'stories', 'cta', 'roles', 'ragebait', 'porte', 'piliers']);
    expect(r.ecritures.at(-1)).toMatchObject({ op: 'set', collection: 'bulletins', doc_id: '2026-W41' });
    expect(r.ecritures.filter(e => e.op === 'set' && e.collection === 'fiches').every(e => !('id' in e.data))).toBe(true);
  });

  it('relance : remplace ses propres idées intactes, garde celles modifiées ou validées, sans doublon', () => {
    const premiere = construireVeille({ profil, fiches: [], entree: entreeFictive, maintenant: MAINTENANT, idAleatoire: id });
    const [a, b, c] = premiere.fichesCreees;
    const modifiee = { ...b, modifiee_depuis_creation: true, accroche: 'Réécrite' };
    const validee = { ...c, statut: 'valide' };
    const seconde = construireVeille({ profil, fiches: [a, modifiee, validee], entree: entreeFictive, maintenant: MAINTENANT, idAleatoire: id });
    const suppressions = seconde.ecritures.filter(e => e.op === 'delete').map(e => e.doc_id);
    expect(suppressions).toEqual([a.id]);
    const placees = seconde.fichesCreees.map(f => f.date_heure);
    expect(placees).not.toContain(modifiee.date_heure);
    expect(placees).not.toContain(validee.date_heure);
    expect(seconde.fichesCreees.some(f => f.accroche.trim().toLowerCase() === c.accroche.trim().toLowerCase())).toBe(false);
    expect(seconde.fichesCreees.length + 2).toBeLessThanOrEqual(5);
    expect(seconde.bulletin.idees).toContain(b.id);
    expect(seconde.bulletin.idees).toContain(c.id);
  });

  it('5 idées gardées : aucune nouvelle idée n’est créée, le bulletin est bien écrit', () => {
    const cle = '2026-W41';
    const gardees = Array.from({ length: 5 }, (_, i) => fiche('reel', '2026-10-05', '12:00', {
      statut: 'brouillon', modifiee_depuis_creation: true, origine: { type: 'veille', bulletin: cle }, accroche: `Gardée ${i}.`,
    }));
    const r = construireVeille({ profil, fiches: gardees, entree: entreeFictive, maintenant: MAINTENANT, idAleatoire: id });
    expect(r.ok).toBe(true);
    expect(r.fichesCreees).toEqual([]);
    expect(r.bulletin.idees).toEqual(gardees.map(f => f.id));
    expect(r.ecritures.at(-1)).toMatchObject({ op: 'set', collection: 'bulletins', doc_id: cle });
  });

  it('sources indisponibles : bulletin partiel, idées quand même', () => {
    const r = construireVeille({ profil, fiches: [], entree: { ...entreeFictive, sources_indisponibles: true, tendances: [] }, maintenant: MAINTENANT, idAleatoire: id });
    expect(r.ok).toBe(true);
    expect(r.bulletin).toMatchObject({ statut: 'partiel', sources_indisponibles: true, tendances: [] });
    expect(r.fichesCreees.length).toBeGreaterThanOrEqual(3);
  });

  it('entrée invalide : aucune écriture', () => {
    const r = construireVeille({ profil, fiches: [], entree: { ...entreeFictive, idees: [] }, maintenant: MAINTENANT, idAleatoire: id });
    expect(r).toEqual({ ok: false, erreurs: ['idees : 3 à 5 idées attendues.'] });
  });

  it('signale les idées placées hors créneau', () => {
    const occupees = ['2026-10-05', '2026-10-06', '2026-10-08'].map(j => fiche('reel', j, '12:00'));
    const r = construireVeille({ profil, fiches: occupees, entree: entreeFictive, maintenant: MAINTENANT, idAleatoire: id });
    expect(r.bulletin.hors_creneau).toEqual(r.fichesCreees.map(f => f.id));
  });

  it('un déclenchement en semaine vise la semaine en cours et ne place aucune idée avant ce moment', () => {
    const MERCREDI = '2026-09-30T08:00:00.000Z'; // mercredi 10h Paris
    const r = construireVeille({ profil, fiches: [], entree: entreeFictive, maintenant: MERCREDI, idAleatoire: id });
    expect(r.ok).toBe(true);
    expect(r.cle).toBe('2026-W40');
    expect(r.fichesCreees.every(f => f.date_heure >= MERCREDI)).toBe(true);
  });

  it('une relance en fin de journée envoie le secours au jour suivant, jamais avant maintenant', () => {
    const MERCREDI_SOIR = '2026-09-30T16:00:00.000Z'; // mercredi 18h Paris
    const r = construireVeille({ profil, fiches: [], entree: entreeFictive, maintenant: MERCREDI_SOIR, idAleatoire: id });
    expect(r.ok).toBe(true);
    expect(r.fichesCreees.every(f => f.date_heure >= MERCREDI_SOIR)).toBe(true);
  });

  it('une idée gardée de ce bulletin déplacée vers une autre semaine compte dans le plafond et dans bulletin.idees', () => {
    const cle = '2026-W41';
    const deplacee = fiche('reel', '2026-10-19', '12:00', {
      statut: 'brouillon', modifiee_depuis_creation: true, origine: { type: 'veille', bulletin: cle }, accroche: 'Déplacée ailleurs.',
    });
    const r = construireVeille({ profil, fiches: [deplacee], entree: entreeFictive, maintenant: MAINTENANT, idAleatoire: id });
    expect(r.ok).toBe(true);
    expect(r.fichesCreees.length + 1).toBeLessThanOrEqual(5);
    expect(r.bulletin.idees).toContain(deplacee.id);
  });

  it('dédoublonne deux idées identiques dans la même entrée', () => {
    const doublon = idee({ accroche: '  Une accroche.  ' });
    const distincte = idee({ pilier: 'socio', accroche: 'Une idée bien différente.' });
    const r = construireVeille({ profil, fiches: [], entree: entree({ idees: [idee(), doublon, distincte] }), maintenant: MAINTENANT, idAleatoire: id });
    expect(r.ok).toBe(true);
    expect(r.fichesCreees).toHaveLength(2);
    expect(r.fichesCreees.map(f => f.accroche.trim().toLowerCase())).toEqual(['une accroche.', 'une idée bien différente.']);
  });

  it('rétrospective : bilan à partir des relevés des 2 semaines précédentes', () => {
    const stats = [{ id: 'x_7j', fiche: 'x', releve: '7j', vues: 1000, nouveaux_abonnes: 4, partages_envois: 12, date_publication: '2026-09-22T10:00:00.000Z', format: 'reel', accroche: 'Accroche x', score_total: 70 }];
    const r = construireVeille({ profil: { ...fictif, version: 1 }, fiches: [], entree: entree(), maintenant: '2026-09-27T18:00:00.000Z', idAleatoire: () => `id${n++}`, stats, relevesCompte: [] });
    expect(r.bulletin.retrospective.type).toBe('bilan');
    expect(r.bulletin.retrospective.meilleur.fiche).toBe('x');
  });
  it('rétrospective : rappel sans relevés, comme avant', () => {
    const r = construireVeille({ profil: { ...fictif, version: 1 }, fiches: [], entree: entree(), maintenant: '2026-09-27T18:00:00.000Z', idAleatoire: () => `id${n++}` });
    expect(r.bulletin.retrospective.type).toBe('rappel');
  });
});

describe('plageVeille et doitTourner', () => {
  const NY = { ...R, fuseau: 'America/New_York' };
  it('vise la semaine de maintenant + 1 jour', () => {
    expect(plageVeille(NY, '2026-10-05T00:00:00.000Z')).toEqual({
      semaine: '2026-W41', debut: '2026-10-05T04:00:00.000Z', fin: '2026-10-12T04:00:00.000Z',
      lecture_debut: '2026-09-21T04:00:00.000Z', lecture_fin: '2026-11-09T05:00:00.000Z',
    });
  });
  it('ne tourne qu’une fois le dimanche à 20 h locale, sauf si on force', () => {
    expect(doitTourner(NY, '2026-10-05T00:00:00.000Z')).toBe(true);
    expect(doitTourner(NY, '2026-10-05T01:00:00.000Z')).toBe(false);
    expect(doitTourner(NY, '2026-11-09T00:00:00.000Z')).toBe(false);
    expect(doitTourner(NY, '2026-11-09T01:00:00.000Z')).toBe(true);
    expect(doitTourner(NY, '2026-10-05T01:00:00.000Z', { forcer: true })).toBe(true);
    expect(doitTourner(NY, '2026-10-07T15:00:00.000Z')).toBe(true);
  });
});
