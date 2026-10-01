/* global __SUPABASE_URL__, __SUPABASE_ANON_KEY__ */
import { createClient } from '@supabase/supabase-js';
import { demarrer } from './app.js';
import { vueConnexion } from './vue-connexion.js';
import { creerConnexion, suivreSession, lienInvalide, retirerErreurDeLAdresse } from '../socle/connexion.js';
import { creerSocle } from '../socle/socle.js';
import { creerEvaluationApi } from '../socle/evaluation-api.js';

const DELAI_CAPACITES_MS = 4000;
const racine = document.getElementById('app');
const client = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__);
const connexion = creerConnexion(client, { origine: window.location.origin });

async function capacitesServeur() {
  const controle = new AbortController();
  const minuterie = setTimeout(() => controle.abort(), DELAI_CAPACITES_MS);
  try {
    const reponse = await fetch('/api/capacites', { headers: { Authorization: `Bearer ${await connexion.jeton()}` }, signal: controle.signal });
    return reponse.ok ? await reponse.json() : {};
  } catch {
    return {};
  } finally {
    clearTimeout(minuterie);
  }
}

async function ouvrir() {
  if (!(await connexion.session())) {
    const avis = lienInvalide(window.location) ? 'Ce lien n’est plus valable : demande-en un nouveau.' : null;
    retirerErreurDeLAdresse(window.location, window.history);
    racine.replaceChildren(vueConnexion(connexion, { avis }));
    return;
  }
  const socle = creerSocle({ client, connexion, document, capacitesServeur: await capacitesServeur(), extras: { sample: creerEvaluationApi({ fetch: window.fetch.bind(window), jeton: connexion.jeton }) } });
  await demarrer(racine, socle);
}

function afficherEchecDemarrage() {
  const p = document.createElement('p');
  p.className = 'aide';
  p.textContent = 'Le studio n’a pas pu démarrer. Recharge la page dans un instant.';
  racine.replaceChildren(p);
}

suivreSession(connexion, () => window.location.reload())
  .then(ouvrir)
  .catch(afficherEchecDemarrage);
