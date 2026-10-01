// Module sans SDK : lisible par les fonctions qui n'appellent pas Claude.
export const cleConfiguree = env => typeof env.ANTHROPIC_API_KEY === 'string' && env.ANTHROPIC_API_KEY.trim().length > 0;
export const modele = env => (typeof env.MODELE_CLAUDE === 'string' && env.MODELE_CLAUDE.trim()) || 'claude-opus-4-8';
