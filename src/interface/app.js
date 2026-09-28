import { h } from './h.js';
import { creerEtat } from './etat.js';
import { creerControleur, plageDeVue, fusionnerInstantane } from './controleur.js';
import { creerRendu } from './rendu.js';
import { creerDepot } from '../donnees/depot.js';
import { creerEnregistreur } from '../donnees/enregistreur.js';

function messageErreurBase(e) {
  if (e?.code === 'revoked') return 'L’accès au studio a été retiré pour cette vue.';
  if (e?.code === 'quota_exceeded') return 'La base du studio est pleine : supprime d’anciennes fiches avant d’en créer d’autres.';
  return 'La base du studio ne répond pas. Recharge la page dans un instant.';
}

export async function demarrer(racine, claude, { horloge = () => new Date().toISOString(), delaiEnregistrement = 600 } = {}) {
  racine.replaceChildren(h('p', { class: 'aide' }, 'Chargement du studio…'));
  const db = (await claude?.use?.('db')) ?? null;
  if (!db) {
    racine.replaceChildren(h('div', { class: 'indisponible' },
      h('h1', {}, 'Studio Contenu'),
      h('p', {}, 'La base du studio n’est pas accessible depuis cette vue. Ouvre le studio sur claude.ai avec un compte qui y a accès.')));
    return null;
  }
  const assets = (await claude.use('assets')) ?? null;
  const depot = creerDepot(db);
  const etat = creerEtat({ profil: undefined, fiches: [], vue: 'semaine', ancre: horloge(), ficheOuverte: null, erreur: null, sauvegarde: 'ok' });
  const enregistreur = creerEnregistreur(
    async fiche => {
      etat.modifier({ sauvegarde: 'en_cours' });
      await depot.enregistrerFiche(fiche);
      etat.modifier({ sauvegarde: 'ok' });
    },
    delaiEnregistrement,
    () => etat.modifier({ sauvegarde: 'erreur' }),
  );
  const actions = creerControleur({ etat, depot, enregistreur, assets, horloge });
  const rendre = creerRendu(racine, actions, { assets: !!assets }, horloge);

  let arreterFiches = null;
  let plageCourante = '';
  etat.abonner(e => {
    if (e.profil) {
      const [debut, fin] = plageDeVue(e.vue, e.ancre, e.profil.regles_studio.fuseau);
      if (`${debut}|${fin}` !== plageCourante) {
        plageCourante = `${debut}|${fin}`;
        arreterFiches?.();
        arreterFiches = depot.ecouterFiches(debut, fin,
          recues => etat.modifier({ fiches: fusionnerInstantane(recues, etat.lire().fiches, enregistreur.estEnAttente) }),
          err => etat.modifier({ erreur: messageErreurBase(err) }));
      }
    }
    rendre(etat.lire());
  });

  depot.ecouterProfil(
    profil => etat.modifier({ profil, vue: profil ? etat.lire().vue : 'profil' }),
    err => etat.modifier({ erreur: messageErreurBase(err) }),
  );
  if (typeof window !== 'undefined') window.addEventListener('pagehide', () => { enregistreur.viderTout(); });
  rendre(etat.lire());
  return { etat, actions };
}
