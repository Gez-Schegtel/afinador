// SPDX-License-Identifier: GPL-3.0-or-later
import { describe, expect, it } from 'vitest';
import { parseScoreBytes } from './alphatab-bridge';
import { buildCatalogPackageZip, parseCatalogPackageZip } from './catalog-export';
import { getFactoryExamples } from './factory-examples';

describe('Exportador e importador de catálogos .zip (Spec 011)', () => {
  it('genera un paquete .zip válido y lo reimporta superando la validación de manifiesto', () => {
    const examples = getFactoryExamples().slice(0, 2);
    const { zipBytes, manifest } = buildCatalogPackageZip({
      catalog: {
        id: 'mi-repertorio',
        name: 'Repertorio de Ensayo',
        description: 'Exportado localmente',
        maintainer: 'Endurend Test',
        homepage: 'https://example.org/endurend',
        license: 'GPL-3.0-or-later',
        baseUrl: '',
      },
      items: examples.map((doc) => ({
        document: doc,
        difficulty: 'intermediate',
      })),
    });

    expect(zipBytes.byteLength).toBeGreaterThan(200);
    expect(manifest.songs.length).toBe(2);

    const parsed = parseCatalogPackageZip(zipBytes);
    expect(parsed.manifest.catalog.id).toBe('mi-repertorio');
    expect(parsed.manifest.songs.length).toBe(2);

    const firstSong = parsed.manifest.songs[0]!;
    const rawScore = parsed.scoreBytesBySongId.get(firstSong.id);
    expect(rawScore).toBeDefined();
    const reimportedDoc = parseScoreBytes(rawScore!, firstSong.scoreUrl, {
      kind: 'catalog',
      sourceId: parsed.manifest.catalog.id,
      sourceName: parsed.manifest.catalog.name,
    });
    expect(reimportedDoc.tracks.length).toBeGreaterThanOrEqual(1);
    expect(reimportedDoc.masterBars.length).toBeGreaterThan(0);
  });
});
