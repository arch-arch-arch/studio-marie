const ESPACE = 'visuels';
const TAILLE_MAX = 20 * 1024 * 1024;
const EXTENSIONS = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp', 'image/gif': 'gif', 'video/mp4': 'mp4', 'video/quicktime': 'mov', 'video/webm': 'webm' };
const erreur = (code, message) => Object.assign(new Error(message ?? code), { code });
const idParDefaut = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

// StorageApiError (storage-js) : `statusCode` est le code porté par le corps de la réponse (chaîne),
// `status` le statut HTTP numérique. Le corps prime : le stockage répond parfois HTTP 400 avec statusCode '404'.
function traduire(e) {
  const statut = String(e?.statusCode ?? e?.status ?? '');
  if (statut === '401' || statut === '403') return erreur('revoked', e.message);
  if (statut === '413') return erreur('too_large', e.message);
  if (statut === '429') return erreur('rate_limited', e.message);
  if (statut === '404') return erreur('not_found', e.message);
  if (statut === '415') return erreur('unsupported_type', e.message);
  return erreur('unavailable', e?.message);
}

export function creerVisuelsSupabase(client, { idAleatoire = idParDefaut } = {}) {
  const espace = () => client.storage.from(ESPACE);
  return {
    async upload(fichier) {
      const extension = EXTENSIONS[fichier.type];
      if (!extension) throw erreur('unsupported_type');
      if (fichier.size > TAILLE_MAX) throw erreur('too_large');
      const id = `${idAleatoire()}.${extension}`;
      const { error } = await espace().upload(id, fichier, { contentType: fichier.type, upsert: false });
      if (error) throw traduire(error);
      return { id };
    },
    async url(id) {
      const { data, error } = await espace().createSignedUrl(id, 3600);
      if (error) throw traduire(error);
      return data.signedUrl;
    },
    async telecharger(id) {
      const { data, error } = await espace().download(id);
      if (error) throw traduire(error);
      return data;
    },
  };
}
