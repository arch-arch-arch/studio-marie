import { describe, it, expect } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import entree from '../../exemples/entree-veille-fictive.json';
import { executer } from '../../scripts/veille.mjs';

const NEW_YORK = { ...fictif, version: 1, regles_studio: { ...fictif.regles_studio, fuseau: 'America/New_York' } };
function deps(fichiers = {}, maintenant = '2026-10-05T00:00:00.000Z') {
  const ecrits = {};
  return {
    ecrits,
    lireJson: p => { if (!(p in fichiers)) throw new Error(`absent : ${p}`); return fichiers[p]; },
    listerJson: dossier => Object.entries(fichiers).filter(([p]) => p.startsWith(`${dossier}/`)).map(([p, contenu]) => ({ nom: p.slice(dossier.length + 1), contenu })),
    ecrireJson: (p, v) => { ecrits[p] = v; },
    maintenant: () => maintenant,
  };
}

describe('doit-tourner', () => {
  const run = (m, extra = []) => executer(['doit-tourner', '--profil', 'p.json', '--maintenant', m, ...extra], deps({ 'p.json': { id: 'courant', data: NEW_YORK, version: 3 } })).sortie;
  const runParis = (m, extra = []) => executer(['doit-tourner', '--profil', 'p.json', '--maintenant', m, ...extra], deps({ 'p.json': fictif })).sortie;
  it('une seule exécution le dimanche 20 h locale, été comme hiver (New York)', () => {
    expect(run('2026-10-05T00:00:00.000Z')).toBe('oui');
    expect(run('2026-10-05T01:00:00.000Z')).toBe('non');
    expect(run('2026-11-09T00:00:00.000Z')).toBe('non');
    expect(run('2026-11-09T01:00:00.000Z')).toBe('oui');
  });
  it('fonctionne aussi au changement d’heure de mars (New York)', () => {
    expect(run('2027-03-15T00:00:00.000Z')).toBe('oui');
    expect(run('2027-03-15T01:00:00.000Z')).toBe('non');
  });
  it('fonctionne pour un autre fuseau (Paris)', () => {
    expect(runParis('2026-10-04T18:05:00.000Z')).toBe('oui'); // dimanche 20h05 local
    expect(runParis('2026-10-04T17:00:00.000Z')).toBe('non'); // dimanche 19h local
  });
  it('un déclenchement manuel un jour de semaine tourne toujours', () => {
    expect(run('2026-10-07T15:12:00.000Z')).toBe('oui');
  });
  it('--forcer tourne toujours, même dans la fenêtre interdite', () => {
    expect(runParis('2026-10-04T19:00:00.000Z', ['--forcer'])).toBe('oui'); // dimanche 21h local, normalement "non"
  });
});

describe('plage', () => {
  it('donne la semaine suivante', () => {
    const r = executer(['plage', '--profil', 'p.json', '--maintenant', '2026-10-05T00:00:00.000Z'], deps({ 'p.json': NEW_YORK }));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.sortie)).toEqual({
      semaine: '2026-W41', debut: '2026-10-05T04:00:00.000Z', fin: '2026-10-12T04:00:00.000Z',
      lecture_debut: '2026-09-21T04:00:00.000Z', lecture_fin: '2026-11-09T05:00:00.000Z',
    });
  });
});

describe('construire', () => {
  it('écrit les écritures et un résumé', () => {
    const d = deps({ 'p.json': { id: 'courant', data: NEW_YORK }, 'e.json': entree, 'f/x.json': { id: 'x', data: { format: 'reel', date_heure: '2026-10-06T16:00:00.000Z', statut: 'valide', origine: { type: 'manuelle' } } } });
    const r = executer(['construire', '--profil', 'p.json', '--fiches', 'f', '--entree', 'e.json', '--sortie', 's.json'], d);
    expect(r.code).toBe(0);
    expect(d.ecrits['s.json'].ecritures.at(-1)).toMatchObject({ collection: 'bulletins', doc_id: '2026-W41' });
    expect(d.ecrits['s.json'].resume).toMatch(/^Bulletin 2026-W41 : \d idée\(s\), 0 remplacée\(s\)/);
  });
  it('épingle la version des fiches remplacées et n’ajoute rien sans --bulletin', () => {
    const remplacable = { id: 'r', version: 4, data: { format: 'reel', date_heure: '2026-10-06T16:00:00.000Z', statut: 'brouillon', origine: { type: 'veille', bulletin: '2026-W41' }, modifiee_depuis_creation: false } };
    const d = deps({ 'p.json': { id: 'courant', data: NEW_YORK }, 'e.json': entree, 'f/r.json': remplacable });
    const r = executer(['construire', '--profil', 'p.json', '--fiches', 'f', '--entree', 'e.json', '--sortie', 's.json'], d);
    expect(r.code).toBe(0);
    const ecritures = d.ecrits['s.json'].ecritures;
    const suppression = ecritures.find(e => e.op === 'delete' && e.doc_id === 'r');
    expect(suppression).toMatchObject({ if_version: 4 });
    const bulletinEcriture = ecritures.find(e => e.op === 'set' && e.collection === 'bulletins');
    expect(bulletinEcriture.if_version).toBeUndefined();
  });
  it('épingle la version du bulletin existant fourni via --bulletin', () => {
    const d = deps({
      'p.json': { id: 'courant', data: NEW_YORK }, 'e.json': entree,
      'f/x.json': { id: 'x', data: { format: 'reel', date_heure: '2026-10-06T16:00:00.000Z', statut: 'valide', origine: { type: 'manuelle' } } },
      'b.json': { id: '2026-W41', data: { semaine: '2026-W41' }, version: 2 },
    });
    const r = executer(['construire', '--profil', 'p.json', '--fiches', 'f', '--entree', 'e.json', '--sortie', 's.json', '--bulletin', 'b.json'], d);
    expect(r.code).toBe(0);
    const ecritures = d.ecrits['s.json'].ecritures;
    const bulletinEcriture = ecritures.find(e => e.op === 'set' && e.collection === 'bulletins');
    expect(bulletinEcriture).toMatchObject({ if_version: 2 });
  });
  it('--versions pose les épingles sur un delete de fiche et le set du bulletin', () => {
    const remplacable = { format: 'reel', date_heure: '2026-10-06T16:00:00.000Z', statut: 'brouillon', origine: { type: 'veille', bulletin: '2026-W41' }, modifiee_depuis_creation: false };
    const d = deps({
      'p.json': NEW_YORK, 'e.json': entree, 'f/r.json': remplacable,
      'v.json': { 'fiches/r': 4, 'bulletins/2026-W41': 2 },
    });
    const r = executer(['construire', '--profil', 'p.json', '--fiches', 'f', '--entree', 'e.json', '--sortie', 's.json', '--versions', 'v.json'], d);
    expect(r.code).toBe(0);
    const ecritures = d.ecrits['s.json'].ecritures;
    expect(ecritures.find(e => e.op === 'delete' && e.doc_id === 'r')).toMatchObject({ if_version: 4 });
    expect(ecritures.find(e => e.op === 'set' && e.collection === 'bulletins')).toMatchObject({ if_version: 2 });
  });
  it('sans --versions et sans version dans les fichiers, aucune épingle n’est posée', () => {
    const remplacable = { format: 'reel', date_heure: '2026-10-06T16:00:00.000Z', statut: 'brouillon', origine: { type: 'veille', bulletin: '2026-W41' }, modifiee_depuis_creation: false };
    const d = deps({ 'p.json': NEW_YORK, 'e.json': entree, 'f/r.json': remplacable });
    const r = executer(['construire', '--profil', 'p.json', '--fiches', 'f', '--entree', 'e.json', '--sortie', 's.json'], d);
    expect(r.code).toBe(0);
    const ecritures = d.ecrits['s.json'].ecritures;
    expect(ecritures.find(e => e.op === 'delete' && e.doc_id === 'r')).not.toHaveProperty('if_version');
    expect(ecritures.find(e => e.op === 'set' && e.collection === 'bulletins')).not.toHaveProperty('if_version');
  });
  it('échoue sans rien écrire si l’entrée est invalide', () => {
    const d = deps({ 'p.json': NEW_YORK, 'e.json': { ...entree, idees: [] } });
    const r = executer(['construire', '--profil', 'p.json', '--fiches', 'f', '--entree', 'e.json', '--sortie', 's.json'], d);
    expect(r.code).toBe(1);
    expect(r.sortie).toContain('idees : 3 à 5 idées attendues.');
    expect(d.ecrits).toEqual({});
  });
  it('refuse une commande inconnue', () => {
    expect(executer(['n-importe'], deps()).code).toBe(1);
  });
  it('exige --fiches, --entree et --sortie', () => {
    const d = deps({ 'p.json': NEW_YORK, 'e.json': entree });
    const r = executer(['construire', '--profil', 'p.json', '--entree', 'e.json', '--sortie', 's.json'], d);
    expect(r.code).toBe(1);
    expect(r.sortie).toBe('Il manque --fiches, --entree ou --sortie.');
    expect(d.ecrits).toEqual({});
  });
  it('échoue sans rien écrire si une fiche est corrompue (listerJson lève une erreur)', () => {
    const ecrits = {};
    const d = {
      ecrits,
      lireJson: p => ({ 'p.json': NEW_YORK, 'e.json': entree })[p],
      listerJson: () => { throw new SyntaxError('JSON invalide'); },
      ecrireJson: (p, v) => { ecrits[p] = v; },
      maintenant: () => '2026-10-05T00:00:00.000Z',
    };
    const r = executer(['construire', '--profil', 'p.json', '--fiches', 'f', '--entree', 'e.json', '--sortie', 's.json'], d);
    expect(r.code).toBe(1);
    expect(d.ecrits).toEqual({});
  });
});

describe('fuseau et date invalides', () => {
  it('refuse un profil sans fuseau valide', () => {
    const mauvais = { ...fictif, regles_studio: { ...fictif.regles_studio, fuseau: 'Pas/UnFuseau' } };
    const r = executer(['plage', '--profil', 'p.json', '--maintenant', '2026-10-05T00:00:00.000Z'], deps({ 'p.json': mauvais }));
    expect(r.code).toBe(1);
    expect(r.sortie).toBe('Fuseau du profil absent ou invalide.');
  });
  it('refuse un profil sans fuseau du tout', () => {
    const mauvais = { ...fictif, regles_studio: { ...fictif.regles_studio, fuseau: undefined } };
    const r = executer(['plage', '--profil', 'p.json', '--maintenant', '2026-10-05T00:00:00.000Z'], deps({ 'p.json': mauvais }));
    expect(r.code).toBe(1);
    expect(r.sortie).toBe('Fuseau du profil absent ou invalide.');
  });
  it('refuse une date --maintenant invalide', () => {
    const r = executer(['plage', '--profil', 'p.json', '--maintenant', 'pas-une-date'], deps({ 'p.json': fictif }));
    expect(r.code).toBe(1);
    expect(r.sortie).toBe('Date --maintenant invalide.');
  });
});
