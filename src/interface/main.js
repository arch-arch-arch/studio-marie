/* global __SUPABASE_URL__, __SUPABASE_ANON_KEY__ */
import { createClient } from '@supabase/supabase-js';
import { demarrer } from './app.js';
import { vueConnexion } from './vue-connexion.js';
import { creerConnexion } from '../socle/connexion.js';
import { creerSocle } from '../socle/socle.js';

const racine = document.getElementById('app');
const client = createClient(__SUPABASE_URL__, __SUPABASE_ANON_KEY__);
const connexion = creerConnexion(client, { origine: window.location.origin });

async function capacitesServeur() {
  try {
    const reponse = await fetch('/api/capacites', { headers: { Authorization: `Bearer ${await connexion.jeton()}` } });
    return reponse.ok ? await reponse.json() : {};
  } catch {
    return {};
  }
}

async function ouvrir() {
  if (!(await connexion.session())) {
    racine.replaceChildren(vueConnexion(connexion));
    return;
  }
  const socle = creerSocle({ client, connexion, document, capacitesServeur: await capacitesServeur() });
  await demarrer(racine, socle);
}

let connecte = null;
connexion.surChangement(session => {
  const maintenant = !!session;
  if (connecte !== null && connecte !== maintenant) window.location.reload();
  connecte = maintenant;
});
connexion.session().then(s => { connecte = !!s; return ouvrir(); });
