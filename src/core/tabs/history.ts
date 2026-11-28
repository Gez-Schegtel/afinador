// SPDX-License-Identifier: GPL-3.0-or-later
/**
 * Pila reversible de historial Undo/Redo sobre `ScoreCommand` (Spec 013).
 */

import {
  createBatchCommand,
  type ScoreCommand,
} from './commands';
import type { ScoreDocument } from './model';

export class CommandHistory {
  private readonly undoStack: ScoreCommand[] = [];
  private readonly redoStack: ScoreCommand[] = [];
  private readonly maxDepth: number;

  constructor(maxDepth = 150) {
    this.maxDepth = Math.max(10, maxDepth);
  }

  public canUndo(): boolean {
    return this.undoStack.length > 0;
  }

  public canRedo(): boolean {
    return this.redoStack.length > 0;
  }

  public undoLabel(): string | null {
    return this.undoStack[this.undoStack.length - 1]?.label ?? null;
  }

  public redoLabel(): string | null {
    return this.redoStack[this.redoStack.length - 1]?.label ?? null;
  }

  public dispatch(doc: ScoreDocument, command: ScoreCommand): ScoreDocument {
    const nextDoc = command.execute(doc);
    this.undoStack.push(command);
    if (this.undoStack.length > this.maxDepth) {
      this.undoStack.shift();
    }
    this.redoStack.length = 0;
    return nextDoc;
  }

  public dispatchBatch(
    doc: ScoreDocument,
    label: string,
    commands: readonly ScoreCommand[]
  ): ScoreDocument {
    if (commands.length === 0) return doc;
    return this.dispatch(doc, createBatchCommand(label, commands));
  }

  public undo(doc: ScoreDocument): { readonly doc: ScoreDocument; readonly undone: ScoreCommand | null } {
    const cmd = this.undoStack.pop();
    if (!cmd) return { doc, undone: null };
    const restored = cmd.undo(doc);
    this.redoStack.push(cmd);
    return { doc: restored, undone: cmd };
  }

  public redo(doc: ScoreDocument): { readonly doc: ScoreDocument; readonly redone: ScoreCommand | null } {
    const cmd = this.redoStack.pop();
    if (!cmd) return { doc, redone: null };
    const reapplied = cmd.execute(doc);
    this.undoStack.push(cmd);
    return { doc: reapplied, redone: cmd };
  }

  public clear(): void {
    this.undoStack.length = 0;
    this.redoStack.length = 0;
  }
}
