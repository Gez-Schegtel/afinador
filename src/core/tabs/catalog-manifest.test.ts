// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import {
  resolveSafeCatalogUrl,
  validateCatalogManifest,
} from './catalog-manifest';

const VALID_MANIFEST = {
  schemaVersion: '1.0',
  catalog: {
    id: 'cat-demo',
    name: 'Repertorio Demo Stoner',
    description: 'Colección de estudio sin fines comerciales',
    maintainer: 'Endurend Libre',
    homepage: 'https://example.org/repertorio',
    license: 'CC0-1.0',
    updatedAt: '2026-11-27T00:00:00Z',
    baseUrl: 'https://example.org/catalog/',
  },
  songs: [
    {
      id: 'riff-01',
      title: 'Riff del Desierto',
      artist: 'Trío Demo',
      bpm: 96,
      timeSignature: '4/4',
      difficulty: 'intermediate',
      tags: ['drop-d', 'stoner'],
      license: 'CC0-1.0',
      scoreUrl: 'scores/riff-01.gp',
      scoreFormat: 'gp',
      chordsUrl: 'https://example.org/catalog/chords/riff-01.cho',
      updatedAt: '2026-11-27T00:00:00Z',
      tracks: [
        {
          index: 0,
          name: 'Guitarra Fuzz',
          instrumentFamily: 'guitar',
          tuningName: 'Drop D',
          tuningNotes: ['D2', 'A2', 'D3', 'G3', 'B3', 'E4'],
          capo: 0,
        },
        {
          index: 1,
          name: 'Bajo',
          instrumentFamily: 'bass',
          tuningName: 'Drop D',
          tuningNotes: ['D1', 'A1', 'D2', 'G2'],
          capo: 0,
        },
      ],
    },
  ],
};

describe('CatalogManifestV1 y seguridad de URLs (Spec 011)', () => {
  it('acepta manifiestos válidos 1.0 y resuelve rutas relativas dentro de baseUrl HTTPS', () => {
    const res = validateCatalogManifest(VALID_MANIFEST);
    expect(res.valid).toBe(true);
    if (!res.valid) return;
    expect(res.manifest.catalog.name).toBe('Repertorio Demo Stoner');
    expect(res.manifest.songs[0]?.scoreUrl).toBe('https://example.org/catalog/scores/riff-01.gp');
    expect(res.manifest.songs[0]?.chordsUrl).toBe(
      'https://example.org/catalog/chords/riff-01.cho'
    );
  });

  it('rechaza versiones desconocidas, HTML/scripts en metadatos y URLs inseguras o con traversal', () => {
    const wrongVer = validateCatalogManifest({ ...VALID_MANIFEST, schemaVersion: '2.0' });
    expect(wrongVer.valid).toBe(false);

    const xssTitle = validateCatalogManifest({
      ...VALID_MANIFEST,
      songs: [{ ...VALID_MANIFEST.songs[0], title: '<script>alert(1)</script>' }],
    });
    expect(xssTitle.valid).toBe(false);

    expect(resolveSafeCatalogUrl('javascript:alert(1)', 'https://example.org/').ok).toBe(false);
    expect(resolveSafeCatalogUrl('http://insecure.org/song.gp', 'https://example.org/').ok).toBe(
      false
    );
    expect(resolveSafeCatalogUrl('../../etc/passwd', 'https://example.org/catalog/').ok).toBe(
      false
    );

    const badScoreUrl = validateCatalogManifest({
      ...VALID_MANIFEST,
      songs: [{ ...VALID_MANIFEST.songs[0], scoreUrl: 'http://bad.org/a.gp' }],
    });
    expect(badScoreUrl.valid).toBe(false);
  });
});
