import { creerBaseSupabase } from './base-supabase.js';
import { creerVisuelsSupabase } from './visuels-supabase.js';
import { creerTelechargement } from './telechargement.js';

export function creerSocle({ client, connexion, document: doc, capacitesServeur = {}, extras = {}, delaiGraceMs }) {
  const serveur = capacitesServeur ?? {};
  const capacites = {
    db: creerBaseSupabase(client, delaiGraceMs === undefined ? undefined : { delaiGraceMs }),
    assets: creerVisuelsSupabase(client),
    downloads: creerTelechargement(doc),
    connexion,
    sample: serveur.evaluation ? (extras.sample ?? null) : null,
    veille: serveur.veille ? (extras.veille ?? null) : null,
    dossier: extras.dossier ?? null,
  };
  return { use: async nom => capacites[nom] ?? null };
}
