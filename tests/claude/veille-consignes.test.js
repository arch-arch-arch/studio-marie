import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const texte = readFileSync(new URL('../../src/claude/veille.md', import.meta.url), 'utf8');

describe('consignes de la veille', () => {
  it('décrit chaque étape et chaque commande du script', () => {
    for (const attendu of [
      'node scripts/veille.mjs doit-tourner', 'node scripts/veille.mjs plage', 'node scripts/veille.mjs construire',
      'ArtifactData', 'WebSearch', 'sources_indisponibles', 'son_a_verifier', 'proposition_profil',
      '"jugement"', 'batch', 'profil/courant', 'bulletins', '--forcer', '--bulletin',
      'stats_contenu', 'releves_compte', '--stats', '--releves',
      '"recommandations":[{"texte":"…","pourquoi":"…"}', '3 recommandations, chacune avec un pourquoi court',
    ]) expect(texte).toContain(attendu);
  });
  it('rappelle les interdits', () => {
    expect(texte).toContain('Ne modifie jamais le profil');
    expect(texte).toContain('Pas de scraping d’Instagram');
    expect(texte).toContain('Aucun commit');
  });
  it('prévoit l’échec du lot final', () => {
    expect(texte).toContain('Si le lot échoue');
  });
});
