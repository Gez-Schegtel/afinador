// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Panel compartido de exportación offline multiformato (Spec 014).
 * Genera descargas binarias o de texto sin marcas de agua ni servidores externos:
 * `.gp`, `.musicxml`, `.mxl`, `.alphatex`, `.mid` y `.cho`.
 */

import {
  exportAlphaTexBytes,
  exportChordProBytes,
  exportGpBytes,
  exportMidiBytes,
  exportMusicXmlBytes,
  exportMxlBytes,
} from '../../core/tabs/exporters';
import type { ScoreDocument } from '../../core/tabs/model';

export interface ExportScorePanelProps {
  doc: ScoreDocument;
  activeTrackIndex: number;
  onClose: () => void;
}

export function downloadBlobBytes(bytes: Uint8Array, fileName: string, mime: string): void {
  const copy = new Uint8Array(bytes.byteLength);
  copy.set(bytes);
  const blob = new Blob([copy.buffer], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function safeFileStem(title: string): string {
  return title.replace(/[^\w-]+/g, '_') || 'tab';
}

export function ExportScorePanel({ doc, activeTrackIndex, onClose }: ExportScorePanelProps) {
  const stem = safeFileStem(doc.title);

  const items: ReadonlyArray<{
    label: string;
    primary?: boolean;
    run: () => { bytes: Uint8Array; ext: string; mime: string };
  }> = [
    {
      label: 'Guitar Pro (.gp)',
      primary: true,
      run: () => ({ bytes: exportGpBytes(doc), ext: 'gp', mime: 'application/octet-stream' }),
    },
    {
      label: 'MusicXML (.musicxml)',
      run: () => ({ bytes: exportMusicXmlBytes(doc), ext: 'musicxml', mime: 'application/xml' }),
    },
    {
      label: 'MusicXML Comprimido (.mxl)',
      run: () => ({ bytes: exportMxlBytes(doc), ext: 'mxl', mime: 'application/zip' }),
    },
    {
      label: 'alphaTex (.alphatex)',
      run: () => ({ bytes: exportAlphaTexBytes(doc), ext: 'alphatex', mime: 'text/plain' }),
    },
    {
      label: 'MIDI Estándar (.mid)',
      run: () => ({ bytes: exportMidiBytes(doc), ext: 'mid', mime: 'audio/midi' }),
    },
    {
      label: 'ChordPro (.cho)',
      run: () => ({
        bytes: exportChordProBytes(doc, activeTrackIndex),
        ext: 'cho',
        mime: 'text/plain',
      }),
    },
  ];

  return (
    <section className="panel-card export-score-panel" aria-label="Exportar partitura offline">
      <div className="tabs-toolbar">
        <strong>Exportar partitura (100% offline, sin marcas de agua)</strong>
        <button type="button" className="chip-btn" onClick={onClose}>
          Cerrar
        </button>
      </div>
      <div className="preset-chips">
        {items.map((item) => (
          <button
            key={item.label}
            type="button"
            className={`chip-btn ${item.primary ? 'is-active' : ''}`}
            onClick={() => {
              const { bytes, ext, mime } = item.run();
              downloadBlobBytes(bytes, `${stem}.${ext}`, mime);
            }}
          >
            {item.label}
          </button>
        ))}
      </div>
    </section>
  );
}
