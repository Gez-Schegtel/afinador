// SPDX-License-Identifier: GPL-3.0-or-later
import { strToU8, zipSync } from 'fflate';
import { describe, expect, it } from 'vitest';
import { TabsLibraryService, createMemoryTabsBackend } from './tabs-db';

describe('Biblioteca BYOT y almacenamiento local (Spec 009)', () => {
  const sampleTexA = `
    \\title "Tema A"
    \\artist "Banda Prueba"
    \\tempo (110)
    .
    0.6.4 2.5.4 2.4.2 |
  `;
  const sampleTexB = `
    \\title "Tema B"
    \\artist "Banda Dos"
    \\tempo (125)
    .
    0.6.4 3.6.4 5.6.2 |
  `;

  it('importa por lote y .zip aislando errores, detectando duplicados y editando metadatos', async () => {
    const db = new TabsLibraryService(createMemoryTabsBackend());

    const zipBytes = zipSync({
      'tema-a.alphatex': strToU8(sampleTexA),
      'tema-b.alphatex': strToU8(sampleTexB),
      'roto.tg': new Uint8Array([1, 2, 3]),
      '__MACOSX/basura.alphatex': strToU8(sampleTexA),
    });

    const summary = await db.importBatchOrZip([{ name: 'coleccion.zip', bytes: zipBytes }]);
    expect(summary.imported).toHaveLength(2);
    expect(summary.errors).toHaveLength(1);
    expect(summary.errors[0]?.fileName).toBe('roto.tg');

    // Reimportar archivo idéntico se detecta como duplicado
    const dup = await db.importFileBytes(strToU8(sampleTexA), 'tema-a-copia.alphatex');
    expect(dup.status).toBe('duplicate');

    const firstId = summary.imported[0]!.id;
    const edited = await db.updateEntryMetadata(firstId, {
      title: 'Tema A Corregido',
      tags: ['stoner', 'ensayo'],
    });
    expect(edited?.title).toBe('Tema A Corregido');
    expect(edited?.tags).toEqual(['stoner', 'ensayo']);
  });

  it('exporta y reimporta Setlist portable (.zip) y Backup completo', async () => {
    const backendA = createMemoryTabsBackend();
    const dbA = new TabsLibraryService(backendA);

    const imp = await dbA.importFileBytes(strToU8(sampleTexA), 'tema-a.alphatex');
    const idA = imp.entry!.id;

    await dbA.toggleFavorite(idA);
    await dbA.saveLoopPreset(idA, { id: 'loop-1', name: 'Solo', startBar: 0, endBar: 0 });
    await dbA.recordRecentPlayback({
      docId: idA,
      title: 'Tema A',
      artist: 'Banda Prueba',
      trackIndex: 0,
      speedPct: 80,
      barIndex: 0,
    });
    await dbA.saveSetlist({
      id: 'set-1',
      name: 'Ensayo Viernes',
      items: [{ docId: idA, note: 'Bajar volumen en intro' }],
      updatedAt: '',
    });

    const setlistZip = await dbA.exportSetlistZip('set-1');
    const backupZip = await dbA.exportFullBackupZip();

    // Restaurar Setlist en instancia limpia
    const dbB = new TabsLibraryService(createMemoryTabsBackend());
    const restoredSetlist = await dbB.importSetlistZip(setlistZip);
    expect(restoredSetlist.name).toBe('Ensayo Viernes');
    expect(await dbB.getLoopsForDoc(idA)).toHaveLength(1);
    expect((await dbB.getDocument(idA))?.document.title).toBe('Tema A');

    // Restaurar Backup completo en instancia limpia
    const dbC = new TabsLibraryService(createMemoryTabsBackend());
    const backupRes = await dbC.importFullBackupZip(backupZip);
    expect(backupRes.restoredCount).toBe(1);
    expect((await dbC.listLibraryEntries()).find((e) => e.id === idA)?.favorite).toBe(true);
    expect((await dbC.getHistory())[0]?.speedPct).toBe(80);
  });
});
