import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const sql = readFileSync(new URL('../supabase/schema.sql', import.meta.url), 'utf8');
const exemple = readFileSync(new URL('../.env.example', import.meta.url), 'utf8');
const ignore = readFileSync(new URL('../.gitignore', import.meta.url), 'utf8');

describe('schéma Supabase', () => {
  it('crée la table, ses index et active la sécurité par ligne', () => {
    for (const attendu of [
      'create table if not exists public.documents', 'primary key (collection, id)', "(data->>'date_heure')", "(data->>'date_publication')",
      'alter table public.documents enable row level security', 'to authenticated', 'alter publication supabase_realtime add table public.documents',
    ]) expect(sql).toContain(attendu);
    expect(sql).not.toMatch(/to anon\b/);
  });
  it('crée le stockage privé des visuels', () => {
    expect(sql).toContain("'visuels'");
    expect(sql).toMatch(/public\s*,?[^;]*false|false\s*,\s*20971520/);
    expect(sql).toContain('storage.objects');
  });
  it('réserve appliquer_veille au rôle de service', () => {
    expect(sql).toContain('create or replace function public.appliquer_veille(ecritures jsonb)');
    expect(sql).toContain('revoke all on function public.appliquer_veille(jsonb) from public, anon, authenticated');
    expect(sql).toContain('grant execute on function public.appliquer_veille(jsonb) to service_role');
    expect(sql).toContain("data->>'maj_le' = e->>'si_maj_le'");
    expect(sql).toContain("set search_path = ''");
  });
});

describe('secrets', () => {
  it('liste les variables sans valeur et ignore les fichiers .env', () => {
    for (const nom of ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'SUPABASE_SERVICE_ROLE_KEY', 'CRON_SECRET', 'ANTHROPIC_API_KEY', 'MODELE_CLAUDE']) {
      expect(exemple).toMatch(new RegExp(`^${nom}=$`, 'm'));
    }
    expect(ignore).toContain('.env');
    expect(ignore).toContain('!.env.example');
  });
});
