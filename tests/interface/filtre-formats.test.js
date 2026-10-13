// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { formatVisible, barreFormats, mentionFiltre } from '../../src/interface/filtre-formats.js';

const TOUS = { story: true, reel: true, post: true };
const actionsFactices = () => ({ changerFiltresApercu: vi.fn() });
const commande = (el, texte) => [...el.querySelectorAll('label')].find(l => l.textContent.trim() === texte)?.querySelector('input');

describe('formatVisible', () => {
  it('le carrousel et la photo suivent le filtre « Posts »', () => {
    const filtres = { story: true, reel: true, post: false };
    expect(formatVisible({ format: 'carrousel' }, filtres)).toBe(false);
    expect(formatVisible({ format: 'post' }, filtres)).toBe(false);
    expect(formatVisible({ format: 'story' }, filtres)).toBe(true);
    expect(formatVisible({ format: 'reel' }, filtres)).toBe(true);
    expect(formatVisible({ format: 'carrousel' }, { story: false, reel: false, post: true })).toBe(true);
  });
});

describe('mentionFiltre', () => {
  it('ne dit rien quand tous les formats sont cochés', () => {
    expect(mentionFiltre(TOUS)).toBeNull();
  });

  it('nomme un format masqué avec l’accord', () => {
    expect(mentionFiltre({ story: false, reel: true, post: true })).toBe('Filtre actif : Stories masquées');
    expect(mentionFiltre({ story: true, reel: false, post: true })).toBe('Filtre actif : Reels masqués');
    expect(mentionFiltre({ story: true, reel: true, post: false })).toBe('Filtre actif : Posts masqués');
  });

  it('nomme deux formats masqués, avec « et »', () => {
    expect(mentionFiltre({ story: false, reel: true, post: false })).toBe('Filtre actif : Stories et Posts masqués');
    expect(mentionFiltre({ story: false, reel: false, post: true })).toBe('Filtre actif : Stories et Reels masqués');
  });

  it('quand aucun format n’est coché, rend null (la barre affiche « Coche au moins un format. »)', () => {
    expect(mentionFiltre({ story: false, reel: false, post: false })).toBeNull();
  });
});

describe('barreFormats', () => {
  it('propose Tout, Stories, Reels et Posts, cochés selon le filtre', () => {
    const el = barreFormats({ story: true, reel: false, post: true }, actionsFactices());
    expect(el.classList.contains('barre-formats')).toBe(true);
    expect(commande(el, 'Tout').checked).toBe(false);
    expect(commande(el, 'Stories').checked).toBe(true);
    expect(commande(el, 'Reels').checked).toBe(false);
    expect(commande(el, 'Posts').checked).toBe(true);
    expect(el.querySelector('[data-commande="format:reel"]')).not.toBeNull();
  });

  it('cocher Reels envoie le filtre complet à changerFiltresApercu', () => {
    const actions = actionsFactices();
    const el = barreFormats({ story: true, reel: false, post: true }, actions);
    commande(el, 'Reels').checked = true;
    commande(el, 'Reels').dispatchEvent(new Event('change'));
    expect(actions.changerFiltresApercu).toHaveBeenCalledWith({ story: true, reel: true, post: true });
  });

  it('« Tout » coche ou décoche les trois formats', () => {
    const actions = actionsFactices();
    const el = barreFormats(TOUS, actions);
    expect(commande(el, 'Tout').checked).toBe(true);
    commande(el, 'Tout').checked = false;
    commande(el, 'Tout').dispatchEvent(new Event('change'));
    expect(actions.changerFiltresApercu).toHaveBeenLastCalledWith({ story: false, reel: false, post: false });
  });

  it('affiche la mention du filtre sous la barre', () => {
    const el = barreFormats({ story: false, reel: true, post: true }, actionsFactices());
    expect(el.querySelector('.mention-filtre').textContent).toBe('Filtre actif : Stories masquées');
  });

  it('sans mention quand tout est coché', () => {
    expect(barreFormats(TOUS, actionsFactices()).querySelector('.mention-filtre')).toBeNull();
  });

  it('aucun format coché affiche « Coche au moins un format. »', () => {
    const el = barreFormats({ story: false, reel: false, post: false }, actionsFactices());
    expect(el.textContent).toContain('Coche au moins un format.');
  });
});
