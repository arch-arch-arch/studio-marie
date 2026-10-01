// Aides des fonctions Vercel : les fichiers api/ restent de simples passe-plats.

export function configurationSupabase(env) {
  return env.SUPABASE_URL && env.SUPABASE_ANON_KEY ? { url: env.SUPABASE_URL, cle: env.SUPABASE_ANON_KEY } : null;
}

// req.body peut arriver déjà décodé (objet) ou en chaîne.
export function lireCorps(body) {
  if (typeof body !== 'string') return { ok: true, corps: body };
  try {
    return { ok: true, corps: JSON.parse(body) };
  } catch {
    return { ok: false };
  }
}

// N'écrit rien dans le journal : une erreur peut citer le prompt, l'image ou le jeton.
export async function repondre(res, traiter) {
  let r;
  try {
    r = await traiter();
  } catch {
    r = { statut: 500, corps: { code: 'unavailable' } };
  }
  res.status(r.statut).json(r.corps);
}
