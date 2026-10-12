import { h } from './h.js';

export function vueConnexion(connexion, { avis = null } = {}) {
  const email = h('input', { type: 'email', name: 'email', required: true, autocomplete: 'email', placeholder: 'ton@adresse.fr' });
  const bouton = h('button', { type: 'submit', class: 'bouton-principal' }, 'Recevoir le lien de connexion');
  const message = h('p', { class: 'aide', role: 'status' }, avis);

  const motDePasse = h('input', { type: 'password', name: 'password', required: true, autocomplete: 'current-password' });
  const boutonMotDePasse = h('button', { type: 'submit', class: 'bouton-secondaire' }, 'Se connecter');
  const messageMotDePasse = h('p', { class: 'aide', role: 'status' });
  const repli = h('details', { class: 'connexion-mot-de-passe' });

  async function demanderLien() {
    bouton.disabled = true;
    message.textContent = 'Envoi du lien…';
    try {
      const r = await connexion.demanderLien(email.value);
      message.textContent = r.ok ? 'Lien envoyé : ouvre ta boîte mail.' : r.raison;
    } catch {
      message.textContent = 'Le lien n’a pas pu être envoyé : réessaie dans un instant.';
    } finally {
      bouton.disabled = false;
    }
  }

  async function connecter() {
    boutonMotDePasse.disabled = true;
    messageMotDePasse.textContent = 'Connexion…';
    let reussi = false;
    try {
      const r = await connexion.connecterParMotDePasse(email.value, motDePasse.value);
      reussi = !!r.ok;
      messageMotDePasse.textContent = r.ok ? 'Connexion réussie.' : r.raison;
    } catch {
      messageMotDePasse.textContent = 'La connexion a échoué : réessaie dans un instant.';
    } finally {
      if (!reussi) boutonMotDePasse.disabled = false;
    }
  }

  repli.append(
    h('summary', {}, 'Se connecter avec un mot de passe'),
    h('form', { onsubmit: e => { e.preventDefault(); return connecter(); } },
      h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Mot de passe'), motDePasse),
      boutonMotDePasse,
      messageMotDePasse));

  return h('div', { class: 'connexion' },
    h('h1', {}, 'Studio Contenu'),
    h('form', {
      onsubmit: e => {
        e.preventDefault();
        // Entrée dans le champ e-mail avec un mot de passe rempli (gestionnaire de mots de passe) : c'est la connexion qui part.
        if (motDePasse.value !== '') {
          repli.open = true;
          return connecter();
        }
        return demanderLien();
      },
    },
    h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Adresse e-mail'), email),
    bouton,
    message),
    repli);
}
