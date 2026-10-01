// Lecture de /api/capacites : chaque essai est borné par un délai, un échec est retenté, et sans réponse exploitable on renonce avec {}.
export async function lireCapacites({ fetch: requeter, jeton, delaiMs = 4000, essais = 2 }) {
  for (let essai = 0; essai < essais; essai += 1) {
    const controle = new AbortController();
    const minuterie = setTimeout(() => controle.abort(), delaiMs);
    try {
      const reponse = await requeter('/api/capacites', { headers: { Authorization: `Bearer ${await jeton()}` }, signal: controle.signal });
      if (reponse.ok) {
        const corps = await reponse.json();
        return corps && typeof corps === 'object' ? corps : {};
      }
    } catch {
      // essai suivant
    } finally {
      clearTimeout(minuterie);
    }
  }
  return {};
}
