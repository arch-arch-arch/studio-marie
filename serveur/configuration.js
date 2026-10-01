// Module sans SDK : lisible par les fonctions qui n'appellent pas Claude.
const renseignee = v => typeof v === 'string' && v.trim().length > 0;
export const cleConfiguree = env => renseignee(env.ANTHROPIC_API_KEY);
export const cleServiceConfiguree = env => renseignee(env.SUPABASE_SERVICE_ROLE_KEY);
export const modele = env => (typeof env.MODELE_CLAUDE === 'string' && env.MODELE_CLAUDE.trim()) || 'claude-opus-4-8';
