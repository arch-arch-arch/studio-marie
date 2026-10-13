// @vitest-environment happy-dom
import { describe, it, expect, vi, afterEach } from 'vitest';
import { visuelMiniature, creerCacheVisuels } from '../../src/interface/visuels.js';

const fiche = (extra = {}) => ({ id: 'a', format: 'post', visuel: 'a.png', visuel_type: 'image', ...extra });
const video = { id: 'v', format: 'reel', visuel: 'v.mp4', visuel_type: 'video' };
const numerote = () => { let n = 0; return vi.fn(async id => `https://stockage.test/${id}?n=${++n}`); };

afterEach(() => { document.body.replaceChildren(); });

describe('visuels : erreur pendant que le nœud est hors écran (C1)', () => {
  it('une erreur hors écran est notée, et la réutilisation redemande un lien neuf, un seul essai', async () => {
    const cache = creerCacheVisuels();
    const actions = { urlVisuel: numerote() };
    const zone = visuelMiniature(fiche(), cache, actions, 'apercu');
    const img = zone.querySelector('img');
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('https://stockage.test/a.png?n=1'));
    img.dispatchEvent(new Event('error'));
    expect(actions.urlVisuel).toHaveBeenCalledTimes(1);
    const reprise = visuelMiniature(fiche(), cache, actions, 'apercu');
    expect(reprise).toBe(zone);
    expect(reprise.querySelector('img')).toBe(img);
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('https://stockage.test/a.png?n=2'));
    expect(actions.urlVisuel).toHaveBeenCalledTimes(2);
  });

  it('après cette reprise, une nouvelle erreur à l’écran donne « Visuel indisponible » sans troisième lien', async () => {
    const cache = creerCacheVisuels();
    const actions = { urlVisuel: numerote() };
    const zone = visuelMiniature(fiche(), cache, actions, 'apercu');
    const img = zone.querySelector('img');
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('https://stockage.test/a.png?n=1'));
    img.dispatchEvent(new Event('error'));
    visuelMiniature(fiche(), cache, actions, 'apercu');
    await vi.waitFor(() => expect(img.getAttribute('src')).toBe('https://stockage.test/a.png?n=2'));
    document.body.append(zone);
    img.dispatchEvent(new Event('error'));
    await vi.waitFor(() => expect(zone.textContent).toContain('Visuel indisponible'));
    expect(actions.urlVisuel).toHaveBeenCalledTimes(2);
  });
});

describe('visuels : portée vignette (C2, C3)', () => {
  it('un visuel indisponible en vignette laisse la lettre du format, sans « Visuel indisponible »', async () => {
    const cache = creerCacheVisuels();
    const actions = { urlVisuel: vi.fn(async () => { throw new Error('x'); }) };
    const zone = visuelMiniature(fiche({ format: 'carrousel' }), cache, actions, 'vignette');
    await vi.waitFor(() => expect(zone.querySelector('img')).toBeNull());
    expect(zone.querySelector('.vignette-lettre').textContent).toBe('C');
    expect(zone.textContent).not.toContain('Visuel indisponible');
  });

  it('pas de marque de lecture dans une vignette vidéo, mais elle reste dans la carte', () => {
    const cache = creerCacheVisuels();
    const actions = { urlVisuel: numerote() };
    expect(visuelMiniature(video, cache, actions, 'vignette').querySelector('.marque-lecture')).toBeNull();
    expect(visuelMiniature(video, creerCacheVisuels(), actions, 'carte').querySelector('.marque-lecture')).not.toBeNull();
  });

  it('preload vaut « none » en vignette et « metadata » ailleurs', () => {
    const actions = { urlVisuel: numerote() };
    expect(visuelMiniature(video, creerCacheVisuels(), actions, 'vignette').querySelector('video').getAttribute('preload')).toBe('none');
    expect(visuelMiniature(video, creerCacheVisuels(), actions, 'carte').querySelector('video').getAttribute('preload')).toBe('metadata');
    expect(visuelMiniature(video, creerCacheVisuels(), actions, 'apercu').querySelector('video').getAttribute('preload')).toBe('metadata');
  });
});
