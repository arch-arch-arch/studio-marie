// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { vueConnexion } from '../../src/interface/vue-connexion.js';

const envoyer = (v, email) => {
  v.querySelector('input[type="email"]').value = email;
  v.querySelector('form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
};

describe('vueConnexion', () => {
  it('demande le lien et confirme l’envoi', async () => {
    const connexion = { demanderLien: vi.fn(async () => ({ ok: true })) };
    const v = vueConnexion(connexion);
    expect(v.querySelector('button[type="submit"]').textContent).toBe('Recevoir le lien de connexion');
    envoyer(v, 'a@exemple.test');
    await vi.waitFor(() => expect(v.textContent).toContain('Lien envoyé : ouvre ta boîte mail.'));
    expect(connexion.demanderLien).toHaveBeenCalledWith('a@exemple.test');
  });
  it('affiche le refus et laisse réessayer', async () => {
    const connexion = { demanderLien: vi.fn(async () => ({ ok: false, raison: 'Cette adresse n’a pas accès au studio.' })) };
    const v = vueConnexion(connexion);
    envoyer(v, 'x@exemple.test');
    await vi.waitFor(() => expect(v.textContent).toContain('Cette adresse n’a pas accès au studio.'));
    expect(v.querySelector('button[type="submit"]').disabled).toBe(false);
    expect(v.textContent).not.toContain('null');
  });
});

describe('vueConnexion : mot de passe', () => {
  const envoyerMotDePasse = (v, email, motDePasse) => {
    v.querySelector('input[type="email"]').value = email;
    v.querySelector('input[type="password"]').value = motDePasse;
    v.querySelector('details form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  };

  it('propose le mot de passe dans un bloc repliable sous le formulaire du lien', () => {
    const v = vueConnexion({ demanderLien: vi.fn() });
    const details = v.querySelector('details');
    expect(details.querySelector('summary').textContent).toBe('Se connecter avec un mot de passe');
    expect(v.querySelector('form')).not.toBe(details.querySelector('form'));
    const champ = details.querySelector('input[type="password"]');
    expect(champ.getAttribute('autocomplete')).toBe('current-password');
    expect(details.textContent).toContain('Mot de passe');
    expect(details.querySelector('button[type="submit"]').textContent).toBe('Se connecter');
    expect(details.querySelector('[role="status"]')).not.toBeNull();
  });
  it('appelle la connexion avec l’adresse saisie et le mot de passe', async () => {
    let fin;
    const connexion = { demanderLien: vi.fn(), connecterParMotDePasse: vi.fn(() => new Promise(r => { fin = r; })) };
    const v = vueConnexion(connexion);
    envoyerMotDePasse(v, 'a@exemple.test', 'motdepasse-test');
    expect(connexion.connecterParMotDePasse).toHaveBeenCalledWith('a@exemple.test', 'motdepasse-test');
    expect(v.querySelector('details button[type="submit"]').disabled).toBe(true);
    expect(v.querySelector('details [role="status"]').textContent).toBe('Connexion…');
    expect(connexion.demanderLien).not.toHaveBeenCalled();
    fin({ ok: true });
    await vi.waitFor(() => expect(v.textContent).toContain('Connexion réussie.'));
  });
  it('affiche l’échec et réactive le bouton', async () => {
    const connexion = { demanderLien: vi.fn(), connecterParMotDePasse: vi.fn(async () => ({ ok: false, raison: 'Adresse ou mot de passe incorrect.' })) };
    const v = vueConnexion(connexion);
    envoyerMotDePasse(v, 'a@exemple.test', 'mauvais-test');
    await vi.waitFor(() => expect(v.querySelector('details [role="status"]').textContent).toBe('Adresse ou mot de passe incorrect.'));
    expect(v.querySelector('details button[type="submit"]').disabled).toBe(false);
    expect(v.textContent).not.toContain('null');
  });
  it('affiche le succès sans afficher « null »', async () => {
    const connexion = { demanderLien: vi.fn(), connecterParMotDePasse: vi.fn(async () => ({ ok: true })) };
    const v = vueConnexion(connexion);
    envoyerMotDePasse(v, 'a@exemple.test', 'motdepasse-test');
    await vi.waitFor(() => expect(v.querySelector('details [role="status"]').textContent).toBe('Connexion réussie.'));
    expect(v.textContent).not.toContain('null');
  });
});
