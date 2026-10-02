import { describe, it, expect, vi } from 'vitest';
import { dimensionsCarte, preparerCartes, imageDepuisBlob, imagesDepuisVideo } from '../../src/dossier/cartes.js';

describe('dimensionsCarte', () => {
  it('pose une image sous le bandeau, bord long à 1568 au plus', () => {
    const d = dimensionsCarte({ largeurs: [3584], hauteurs: [2016] });
    expect(d.largeur).toBe(1568);
    expect(d.cases[0]).toMatchObject({ x: 0, largeur: 1568 });
    expect(d.cases[0].y).toBe(d.bandeau);
    expect(Math.max(d.largeur, d.hauteur)).toBeLessThanOrEqual(1568);
  });
  it('garde une image verticale entière', () => {
    const d = dimensionsCarte({ largeurs: [1080], hauteurs: [1920] });
    expect(d.hauteur).toBeLessThanOrEqual(1568);
    expect(d.cases[0].hauteur + d.bandeau).toBe(d.hauteur);
    expect(d.cases[0].largeur / d.cases[0].hauteur).toBeCloseTo(1080 / 1920, 2);
  });
  it('aligne trois images de vidéo côte à côte', () => {
    const d = dimensionsCarte({ largeurs: [1080, 1080, 1080], hauteurs: [1920, 1920, 1920] });
    expect(d.cases).toHaveLength(3);
    expect(d.cases[1].x).toBeGreaterThan(d.cases[0].x + d.cases[0].largeur - 1);
    expect(d.largeur).toBeLessThanOrEqual(1568);
    expect(d.largeur).toBeGreaterThanOrEqual(600);
  });
  it.each([
    ['très large', [5000], [500]],
    ['très haute', [500], [5000]],
    ['trois images de vidéo horizontales', [1920, 1920, 1920], [1080, 1080, 1080]],
    ['minuscule', [1], [1]],
  ])('ne dépasse jamais 1568 sur son bord long : %s', (_, largeurs, hauteurs) => {
    const d = dimensionsCarte({ largeurs, hauteurs });
    expect(Math.max(d.largeur, d.hauteur)).toBeLessThanOrEqual(1568);
    for (const c of d.cases) {
      expect(c.x + c.largeur).toBeLessThanOrEqual(d.largeur);
      expect(c.y + c.hauteur).toBeLessThanOrEqual(d.hauteur);
      expect(c.largeur).toBeGreaterThanOrEqual(1);
    }
    expect(d.echelle).toBeGreaterThan(0);
    expect(d.echelle).toBeLessThanOrEqual(1);
  });
});

const demande = ref => ({ ref, etiquette: `${ref} · lun.`, visuel: `v-${ref}`, type: null });

describe('preparerCartes avec des outils injectés', () => {
  const dessiner = vi.fn(async (etiquette, sources) => ({ carte: new Blob(['x']), largeur: 10, hauteur: 10, n: sources.length }));
  it('traite les fiches dans l’ordre et continue après un échec', async () => {
    const ordre = [];
    const charger = async id => { ordre.push(id); if (id === 'v-F02') throw new Error('absent'); return new Blob([id]); };
    const versImage = vi.fn(async () => ({ width: 1, height: 1 }));
    const cartes = await preparerCartes([demande('F01'), demande('F02'), demande('F03')], charger, { versImage, versImagesVideo: vi.fn(), dessiner });
    expect(ordre).toEqual(['v-F01', 'v-F02', 'v-F03']);
    expect([...cartes.keys()]).toEqual(['F01', 'F02', 'F03']);
    expect(cartes.get('F01').ok).toBe(true);
    expect(cartes.get('F02')).toEqual({ ok: false });
    expect(cartes.get('F03').ok).toBe(true);
  });
  it('donne ok:false quand le chargement dépasse le délai, sans bloquer la suite', async () => {
    const charger = id => (id === 'v-F01' ? new Promise(() => {}) : Promise.resolve(new Blob(['x'])));
    const cartes = await preparerCartes([demande('F01'), demande('F02')], charger, { versImage: async () => ({ width: 1, height: 1 }), dessiner, delaiChargementMs: 20 });
    expect(cartes.get('F01')).toEqual({ ok: false });
    expect(cartes.get('F02').ok).toBe(true);
  });
  it('utilise 8 secondes par défaut', async () => {
    vi.useFakeTimers();
    try {
      const p = preparerCartes([demande('F01')], () => new Promise(() => {}), { dessiner });
      let fini = false;
      p.then(() => { fini = true; });
      await vi.advanceTimersByTimeAsync(7999);
      expect(fini).toBe(false);
      await vi.advanceTimersByTimeAsync(2);
      expect((await p).get('F01')).toEqual({ ok: false });
    } finally { vi.useRealTimers(); }
  });
  it('lit une vidéo avec versImagesVideo et une photo avec versImage', async () => {
    const versImage = vi.fn(async () => ({ width: 1, height: 1 }));
    const versImagesVideo = vi.fn(async () => [{ width: 1, height: 1 }, { width: 1, height: 1 }]);
    const cartes = await preparerCartes([{ ...demande('F01'), type: 'video' }, demande('F02')], async () => new Blob(['x']), { versImage, versImagesVideo, dessiner });
    expect(versImagesVideo).toHaveBeenCalledTimes(1);
    expect(versImage).toHaveBeenCalledTimes(1);
    expect(cartes.get('F01').n).toBe(2);
    expect(cartes.get('F02').n).toBe(1);
  });
  it('donne ok:false quand la lecture de la vidéo ou le dessin échoue', async () => {
    const cartes = await preparerCartes([{ ...demande('F01'), type: 'video' }, demande('F02')], async () => new Blob(['x']), {
      versImage: async () => ({ width: 1, height: 1 }), versImagesVideo: async () => { throw new Error('vidéo'); }, dessiner: async () => { throw new Error('toile'); },
    });
    expect(cartes.get('F01')).toEqual({ ok: false });
    expect(cartes.get('F02')).toEqual({ ok: false });
  });
  it('libère les images de la carte', async () => {
    const close = vi.fn();
    await preparerCartes([demande('F01')], async () => new Blob(['x']), { versImage: async () => ({ width: 1, height: 1, close }), dessiner });
    expect(close).toHaveBeenCalledTimes(1);
  });
});

describe('imageDepuisBlob', () => {
  const blob = new Blob(['x']);
  const fauxURL = () => ({ createObjectURL: vi.fn(() => 'blob:x'), revokeObjectURL: vi.fn() });
  class ImageOk { set src(v) { setTimeout(() => { this.width = 4; this.height = 5; this.onload(); }, 0); } }
  class ImageKo { set src(v) { setTimeout(() => this.onerror(new Error('x')), 0); } }

  it('demande l’orientation enregistrée dans l’image', async () => {
    const image = { width: 3, height: 2 };
    const createImageBitmap = vi.fn(async () => image);
    expect(await imageDepuisBlob(blob, { createImageBitmap })).toBe(image);
    expect(createImageBitmap).toHaveBeenCalledWith(blob, { imageOrientation: 'from-image' });
  });
  it('se replie sur un élément Image sans createImageBitmap, puis révoque l’URL', async () => {
    const URL = fauxURL();
    const image = await imageDepuisBlob(blob, { createImageBitmap: null, Image: ImageOk, URL });
    expect(image).toMatchObject({ width: 4, height: 5 });
    expect(URL.createObjectURL).toHaveBeenCalledWith(blob);
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:x');
  });
  it('se replie sur un élément Image quand createImageBitmap lève', async () => {
    const URL = fauxURL();
    const createImageBitmap = vi.fn(async () => { throw new Error('non'); });
    const image = await imageDepuisBlob(blob, { createImageBitmap, Image: ImageOk, URL });
    expect(image.width).toBe(4);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it('révoque l’URL et lève quand l’image est illisible', async () => {
    const URL = fauxURL();
    await expect(imageDepuisBlob(blob, { createImageBitmap: null, Image: ImageKo, URL })).rejects.toThrow();
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
});

describe('imagesDepuisVideo', () => {
  function fausseVideo({ frameCallback = true, playRejette = false } = {}) {
    const journal = [];
    const v = {
      journal, duration: 6, videoWidth: 4, videoHeight: 3, readyState: 0,
      removeAttribute() {},
      play() {
        journal.push('play');
        if (playRejette) return Promise.reject(new Error('refus'));
        setTimeout(() => { v.readyState = 2; journal.push('image'); if (frameCallback) v._frame?.(); else v.onloadeddata?.(); }, 0);
        return Promise.resolve();
      },
      pause() { journal.push('pause'); },
      set src(x) { setTimeout(() => v.onloadedmetadata?.(), 0); },
      set currentTime(t) { journal.push(`seek ${t}`); setTimeout(() => v.onseeked?.(), 0); },
    };
    if (frameCallback) v.requestVideoFrameCallback = f => { v._frame = f; };
    return v;
  }
  const document = video => ({
    createElement: nom => (nom === 'video' ? video : { width: 0, height: 0, getContext: () => ({ drawImage: () => {} }) }),
  });
  const faux = () => ({ createObjectURL: () => 'blob:v', revokeObjectURL: vi.fn() });

  it.each([[true], [false]])('lance la lecture muette, attend la première image, met en pause puis parcourt trois instants (requestVideoFrameCallback : %s)', async frameCallback => {
    const video = fausseVideo({ frameCallback });
    const u = faux();
    const images = await imagesDepuisVideo(new Blob(['v']), document(video), { URL: u });
    expect(images).toHaveLength(3);
    expect(video.muted).toBe(true);
    expect(video.playsInline).toBe(true);
    expect(video.journal.slice(0, 3)).toEqual(['play', 'image', 'pause']);
    expect(video.journal.slice(3, 6)).toEqual(['seek 1', 'seek 3', 'seek 5']);
    expect(u.revokeObjectURL).toHaveBeenCalledWith('blob:v');
  });
  it('échoue quand la lecture est refusée', async () => {
    const u = faux();
    await expect(imagesDepuisVideo(new Blob(['v']), document(fausseVideo({ playRejette: true })), { URL: u })).rejects.toThrow();
    expect(u.revokeObjectURL).toHaveBeenCalledTimes(1);
  });
  it('échoue quand la première image n’arrive jamais', async () => {
    const video = fausseVideo();
    video.play = () => Promise.resolve();
    await expect(imagesDepuisVideo(new Blob(['v']), document(video), { URL: faux(), delaiMs: 30 })).rejects.toThrow();
  });
  it('échoue sur une erreur de vidéo', async () => {
    const video = fausseVideo();
    Object.defineProperty(video, 'src', { set() { setTimeout(() => video.onerror?.(), 0); } });
    await expect(imagesDepuisVideo(new Blob(['v']), document(video), { URL: faux() })).rejects.toThrow();
  });
});
