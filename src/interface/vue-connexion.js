import { h } from './h.js';

export function vueConnexion(connexion) {
  const email = h('input', { type: 'email', name: 'email', required: true, autocomplete: 'email', placeholder: 'ton@adresse.fr' });
  const bouton = h('button', { type: 'submit', class: 'bouton-principal' }, 'Recevoir le lien de connexion');
  const message = h('p', { class: 'aide', role: 'status' });

  const motDePasse = h('input', { type: 'password', name: 'password', required: true, autocomplete: 'current-password' });
  const boutonMotDePasse = h('button', { type: 'submit', class: 'bouton-secondaire' }, 'Se connecter');
  const messageMotDePasse = h('p', { class: 'aide', role: 'status' });

  return h('div', { class: 'connexion' },
    h('h1', {}, 'Studio Contenu'),
    h('form', {
      onsubmit: async e => {
        e.preventDefault();
        bouton.disabled = true;
        message.textContent = 'Envoi du lien…';
        const r = await connexion.demanderLien(email.value);
        bouton.disabled = false;
        message.textContent = r.ok ? 'Lien envoyé : ouvre ta boîte mail.' : r.raison;
      },
    },
    h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Adresse e-mail'), email),
    bouton,
    message),
    h('details', { class: 'connexion-mot-de-passe' },
      h('summary', {}, 'Se connecter avec un mot de passe'),
      h('form', {
        onsubmit: async e => {
          e.preventDefault();
          boutonMotDePasse.disabled = true;
          messageMotDePasse.textContent = 'Connexion…';
          const r = await connexion.connecterParMotDePasse(email.value, motDePasse.value);
          if (r.ok) {
            messageMotDePasse.textContent = 'Connexion réussie.';
            return;
          }
          boutonMotDePasse.disabled = false;
          messageMotDePasse.textContent = r.raison;
        },
      },
      h('label', { class: 'champ' }, h('span', { class: 'champ-libelle' }, 'Mot de passe'), motDePasse),
      boutonMotDePasse,
      messageMotDePasse)));
}
