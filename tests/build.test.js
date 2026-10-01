import { describe, it, expect } from 'vitest';
import { construire } from '../scripts/build.mjs';

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
