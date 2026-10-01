// Forme réelle de auth.getUser(jeton) (auth-js) : { data: { user }, error: null } ou { data: { user: null }, error }.
// On ne garde que l'identifiant et l'adresse : le reste de l'objet utilisateur n'a pas à circuler.
export async function verifierSession(supabase, enTete) {
  const jeton = typeof enTete === 'string' && enTete.startsWith('Bearer ') ? enTete.slice(7).trim() : '';
  if (!jeton) return { ok: false };
  const { data, error } = await supabase.auth.getUser(jeton);
  if (error || !data?.user) return { ok: false };
  return { ok: true, utilisateur: { id: data.user.id, email: data.user.email } };
}
