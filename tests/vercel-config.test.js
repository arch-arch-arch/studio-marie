import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const lire = f => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');

describe('configuration Vercel', () => {
  const config = JSON.parse(lire('vercel.json'));
  it('fixe la durée maximale des fonctions longues', () => {
    expect(config.functions).toEqual({ 'api/veille.js': { maxDuration: 300 }, 'api/evaluer.js': { maxDuration: 120 } });
  });
  it('garde la même durée dans les fichiers de fonction', () => {
    expect(lire('api/veille.js')).toContain('maxDuration: 300');
    expect(lire('api/evaluer.js')).toContain('maxDuration: 120');
  });
  it('ignore le dossier local .vercel', () => {
    expect(lire('.gitignore').split(/\r?\n/)).toContain('.vercel/');
  });
});
