// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';
import fictif from '../../exemples/profil-fictif.json';
import { nouvelleFiche } from '../../src/logique/fiche.js';
import { panneauFiche } from '../../src/interface/panneau-fiche.js';

const fiche = (extra = {}) => ({ ...nouvelleFiche({ id: 'f1', format: 'reel', date_heure: '2026-09-28T10:00:00.000Z', pilier: 'socio', maintenant: 'x' }), ...extra });
const actionsFactices = () => ({
  modifierFiche: vi.fn(), fermerPanneau: vi.fn(), supprimerFiche: vi.fn(),
  changerStatut: vi.fn(async () => ({ ok: false, raison: 'Ajoute un visuel avant de valider.' })),
  televerserVisuel: vi.fn(async () => ({ ok: true, id: 'as1', type: 'image' })),
});
const saisir = (el, valeur, evenement = 'input') => { el.value = valeur; el.dispatchEvent(new Event(evenement, { bubbles: true })); };
const bouton = (racine, texte) => [...racine.querySelectorAll('button')].find(b => b.textContent === texte);

beforeEach(() => {
  Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: vi.fn(async () => {}) } });
});

describe('panneauFiche', () => {
  it('transmet chaque saisie', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    saisir(p.querySelector('textarea[name="accroche"]'), 'Nouvelle accroche');
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { accroche: 'Nouvelle accroche' });
    saisir(p.querySelector('input[name="hashtags"]'), '#nuit socio', 'change');
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { hashtags: ['nuit', 'socio'] });
  });

  it('convertit la date et l’heure locales en UTC', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    saisir(p.querySelector('input[type="time"]'), '18:30', 'change');
    expect(actions.modifierFiche).toHaveBeenCalledWith('f1', { date_heure: '2026-09-28T16:30:00.000Z' });
  });

  it('n’affiche « Mène à la porte » que pour une story', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    expect(p.textContent).not.toContain('Mène à la porte');
    saisir(p.querySelector('select[name="format"]'), 'story', 'change');
    expect(p.textContent).toContain('Mène à la porte');
  });

  it('affiche la raison d’un changement de statut refusé', async () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    bouton(p, 'Validé').click();
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Ajoute un visuel avant de valider.'));
    expect(actions.changerStatut).toHaveBeenCalledWith('f1', 'valide');
  });

  it('copie la caption et les hashtags', async () => {
    const p = panneauFiche(fiche({ caption: 'Bonsoir.', hashtags: ['nuit'] }), fictif, actionsFactices(), { assets: true });
    bouton(p, 'Copier la caption et les hashtags').click();
    await vi.waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith('Bonsoir.\n\n#nuit'));
  });

  it('demande confirmation avant de supprimer', () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    bouton(p, 'Supprimer la fiche').click();
    expect(actions.supprimerFiche).not.toHaveBeenCalled();
    bouton(p, 'Oui, supprimer').click();
    expect(actions.supprimerFiche).toHaveBeenCalledWith('f1');
  });

  it('explique l’absence de téléversement', () => {
    const p = panneauFiche(fiche(), fictif, actionsFactices(), { assets: false });
    expect(p.textContent).toContain('Le téléversement de visuels n’est pas disponible dans cette vue.');
    expect(p.querySelector('input[type="file"]')).toBeNull();
  });

  it('refuse un fichier qui n’est ni image ni vidéo', async () => {
    const actions = actionsFactices();
    const p = panneauFiche(fiche(), fictif, actions, { assets: true });
    const zone = p.querySelector('.zone-visuel');
    const evt = new Event('drop', { bubbles: true, cancelable: true });
    Object.defineProperty(evt, 'dataTransfer', { value: { files: [{ type: 'application/pdf' }] } });
    zone.dispatchEvent(evt);
    await vi.waitFor(() => expect(p.querySelector('.panneau-message').textContent).toBe('Choisis une image ou une vidéo.'));
    expect(actions.televerserVisuel).not.toHaveBeenCalled();
  });

  it('rétrograde l’affichage en Brouillon quand modifierFiche renvoie un nouveau statut, sans perdre le focus de la caption', () => {
    const f = fiche({ statut: 'valide' });
    const actions = actionsFactices();
    actions.modifierFiche = vi.fn(() => ({ ...fiche(), statut: 'brouillon' }));
    const p = panneauFiche(f, fictif, actions, { assets: true });
    const caption = p.querySelector('textarea[name="caption"]');
    saisir(caption, 'Nouvelle caption');
    const brouillonBouton = bouton(p, 'Brouillon');
    expect(brouillonBouton.getAttribute('aria-pressed')).toBe('true');
    expect(p.querySelector('.panneau-message').textContent).toBe('La fiche est repassée en Brouillon : réévalue-la.');
    expect(p.querySelector('textarea[name="caption"]')).toBe(caption);
  });
});
