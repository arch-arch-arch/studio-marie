// @vitest-environment happy-dom
import { describe, it, expect, vi } from 'vitest';
import { h } from '../../src/interface/h.js';

describe('h', () => {
  it('crée un élément avec classe, attributs et enfants aplatis', () => {
    const el = h('div', { class: 'boite', 'data-id': 'x', title: 'Titre' }, 'a', [h('span', {}, 'b'), null, false, ['c']]);
    expect(el.className).toBe('boite');
    expect(el.getAttribute('data-id')).toBe('x');
    expect(el.title).toBe('Titre');
    expect(el.textContent).toBe('abc');
  });
  it('branche les écouteurs et ignore les props nulles ou fausses', () => {
    const clic = vi.fn();
    const el = h('button', { onclick: clic, disabled: false, 'aria-current': null }, 'ok');
    el.click();
    expect(clic).toHaveBeenCalledTimes(1);
    expect(el.disabled).toBe(false);
    expect(el.hasAttribute('aria-current')).toBe(false);
  });
  it('accepte un objet de style et les variables CSS', () => {
    const el = h('div', { style: { color: 'red', '--pilier': '#123456' } });
    expect(el.style.color).toBe('red');
    expect(el.style.getPropertyValue('--pilier')).toBe('#123456');
  });
});
