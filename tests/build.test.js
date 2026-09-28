import { describe, it, expect } from 'vitest';
import { construire } from '../scripts/build.mjs';

describe('construire', () => {
  it('produit une page unique, sans squelette html, avec styles et script inclus', async () => {
    const html = await construire();
    expect(html.startsWith('<title>Studio Contenu</title>')).toBe(true);
    expect(html).not.toMatch(/<html|<body|<!doctype/i);
    expect(html).toContain('<div id="app"></div>');
    expect(html).not.toContain('/*SCRIPT*/');
    expect(html).not.toContain('/*STYLES*/');
    expect(html).toContain('--fond');
  });
});
