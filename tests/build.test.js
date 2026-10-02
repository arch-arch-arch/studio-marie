import { describe, it, expect } from 'vitest';
import { construire, construireDossier } from '../scripts/build.mjs';

describe('construire', () => {
  it('produit un document complet avec la configuration publique', async () => {
    const html = await construire({ SUPABASE_URL: 'https://projet.test', SUPABASE_ANON_KEY: 'cle-publique' });
    expect(html.startsWith('<!doctype html>')).toBe(true);
    expect(html).toContain('<html lang="fr">');
    expect(html).toContain('<meta name="viewport"');
    expect(html).toContain('<title>Studio Contenu</title>');
    expect(html).toContain('<div id="app"></div>');
    expect(html).not.toContain('/*SCRIPT*/');
    expect(html).not.toContain('/*STYLES*/');
    expect(html).toContain('--fond');
    expect(html).toContain('https://projet.test');
    expect(html).toContain('cle-publique');
  });
  it('échoue clairement sans configuration', async () => {
    await expect(construire({})).rejects.toThrow('SUPABASE_URL et SUPABASE_ANON_KEY sont requis pour construire la page.');
  });
  it('n’embarque aucune clé secrète', async () => {
    const html = await construire({ SUPABASE_URL: 'https://projet.test', SUPABASE_ANON_KEY: 'cle-publique', SUPABASE_SERVICE_ROLE_KEY: 'SECRET-SERVICE', ANTHROPIC_API_KEY: 'SECRET-CLAUDE', CRON_SECRET: 'SECRET-CRON' });
    for (const secret of ['SECRET-SERVICE', 'SECRET-CLAUDE', 'SECRET-CRON']) expect(html).not.toContain(secret);
  });
});

describe('construireDossier', () => {
  it('produit un module séparé qui porte la bibliothèque PDF', async () => {
    const js = await construireDossier();
    expect(js).toContain('preparerCartes');
    expect(js).toContain('assemblerPdf');
    expect(js.length).toBeGreaterThan(100000);
    expect(js.length).toBeLessThan(500 * 1024);
    expect(js).toMatch(/export\s*\{[^}]*assemblerPdf/);
    expect(js).toMatch(/export\s*\{[^}]*preparerCartes/);
  }, 30000);
  it('n’embarque pas les dépendances optionnelles de jsPDF (html2canvas, canvg, dompurify)', async () => {
    const js = await construireDossier();
    for (const lib of ['html2canvas', 'canvg', 'dompurify']) {
      expect(js).not.toMatch(new RegExp(`import\\(["']${lib}["']\\)`));
      expect(js).not.toContain(`from"${lib}"`);
    }
  }, 30000);
  it('laisse la page principale sans la bibliothèque PDF', async () => {
    const html = await construire({ SUPABASE_URL: 'https://projet.test', SUPABASE_ANON_KEY: 'cle-publique' });
    expect(html).not.toContain('jsPDF');
    expect(html).toContain('/dossier.js');
    expect(html).toMatch(/import\(["']\/dossier\.js["']\)/);
  }, 30000);
});
