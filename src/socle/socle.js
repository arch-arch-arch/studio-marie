import { creerBaseSupabase } from './base-supabase.js';
import { creerVisuelsSupabase } from './visuels-supabase.js';
import { creerTelechargement } from './telechargement.js';

export function creerSocle({ client, connexion, document: doc, capacitesServeur = {}, extras = {} }) {
  const capacites = {
    db: creerBaseSupabase(client),
    assets: creerVisuelsSupabase(client),
    downloads: creerTelechargement(doc),
    connexion,
    sample: capacitesServeur.evaluation ? (extras.sample ?? null) : null,
    veille: capacitesServeur.veille ? (extras.veille ?? null) : null,
  };
  return { use: async nom => capacites[nom] ?? null };
}
