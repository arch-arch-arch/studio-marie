const LIMITES = { maxPromptBytes: 65536, images: { maxCount: 1, maxInputBytes: 3000000, mediaTypes: ['image/png', 'image/jpeg', 'image/webp', 'image/gif'] } };
const erreur = code => Object.assign(new Error(code), { code });

async function enBase64(blob) {
  const octets = new Uint8Array(await blob.arrayBuffer());
  let binaire = '';
  for (let i = 0; i < octets.length; i += 0x8000) binaire += String.fromCharCode(...octets.subarray(i, i + 0x8000));
  return btoa(binaire);
}

export function creerEvaluationApi({ fetch: requeter, jeton }) {
  return {
    limits: async () => structuredClone(LIMITES),
    async json(prompt, { signal, images } = {}) {
      const acces = await jeton();
      if (!acces) throw erreur('session_expired');
      // Le contrôleur envoie un Blob ; on accepte aussi un tableau d'un seul visuel (une seule image est prise en charge).
      const visuel = Array.isArray(images) ? images[0] : images;
      const image = visuel ? { media_type: visuel.type, data: await enBase64(visuel) } : undefined;
      let reponse;
      try {
        reponse = await requeter('/api/evaluer', {
          method: 'POST', signal,
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${acces}` },
          body: JSON.stringify({ prompt, image }),
        });
      } catch (e) {
        throw erreur(e?.name === 'AbortError' ? 'cancelled' : 'unavailable');
      }
      const corps = await reponse.json().catch(() => ({}));
      if (signal?.aborted) throw erreur('cancelled');
      if (!reponse.ok) throw erreur(corps?.code ?? 'unavailable');
      return corps.reponse;
    },
  };
}
