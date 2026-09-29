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
  const run = m => executer(['doit-tourner', '--profil', 'p.json', '--maintenant', m], deps({ 'p.json': { id: 'courant', data: NEW_YORK, version: 3 } })).sortie;
  it('une seule exécution le dimanche 20 h locale, été comme hiver', () => {
    expect(run('2026-10-05T00:00:00.000Z')).toBe('oui');
    expect(run('2026-10-05T01:00:00.000Z')).toBe('non');
    expect(run('2026-11-09T00:00:00.000Z')).toBe('non');
    expect(run('2026-11-09T01:00:00.000Z')).toBe('oui');
  });
  it('un déclenchement manuel tourne toujours', () => {
    expect(run('2026-10-07T15:12:00.000Z')).toBe('oui');
  });
});

describe('plage', () => {
  it('donne la semaine suivante', () => {
    const r = executer(['plage', '--profil', 'p.json', '--maintenant', '2026-10-05T00:00:00.000Z'], deps({ 'p.json': NEW_YORK }));
    expect(r.code).toBe(0);
    expect(JSON.parse(r.sortie)).toEqual({ semaine: '2026-W41', debut: '2026-10-05T04:00:00.000Z', fin: '2026-10-12T04:00:00.000Z' });
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
});
