import test from 'node:test';
import assert from 'node:assert/strict';

class HistoryManager {
  constructor() {
    this.swaps = {};
    this.undoStack = [];
    this.redoStack = [];
  }

  get canUndo() {
    return this.undoStack.length > 0;
  }

  get canRedo() {
    return this.redoStack.length > 0;
  }

  commit(newSwaps) {
    this.undoStack.push({ ...this.swaps });
    this.redoStack = [];
    this.swaps = { ...newSwaps };
  }

  undo() {
    if (this.undoStack.length === 0) return null;
    const prev = this.undoStack.pop();
    this.redoStack.push({ ...this.swaps });
    this.swaps = prev;
    return this.swaps;
  }

  redo() {
    if (this.redoStack.length === 0) return null;
    const next = this.redoStack.pop();
    this.undoStack.push({ ...this.swaps });
    this.swaps = next;
    return this.swaps;
  }
}

test('Undo and redo history management behaves predictably', () => {
  const h = new HistoryManager();
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, false);

  // Apply swap 1
  h.commit({ p1: 'face_a' });
  assert.equal(h.canUndo, true);
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.swaps, { p1: 'face_a' });

  // Apply swap 2
  h.commit({ p1: 'face_a', p2: 'face_b' });
  assert.equal(h.canUndo, true);
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.swaps, { p1: 'face_a', p2: 'face_b' });

  // Undo back to swap 1
  h.undo();
  assert.equal(h.canUndo, true);
  assert.equal(h.canRedo, true);
  assert.deepEqual(h.swaps, { p1: 'face_a' });

  // Undo back to initial empty swaps
  h.undo();
  assert.equal(h.canUndo, false);
  assert.equal(h.canRedo, true);
  assert.deepEqual(h.swaps, {});

  // Redo back to swap 1
  h.redo();
  assert.equal(h.canUndo, true);
  assert.equal(h.canRedo, true);
  assert.deepEqual(h.swaps, { p1: 'face_a' });

  // Redo back to swap 2
  h.redo();
  assert.equal(h.canUndo, true);
  assert.equal(h.canRedo, false);
  assert.deepEqual(h.swaps, { p1: 'face_a', p2: 'face_b' });

  // Undo 1 step and then commit a branch
  h.undo();
  assert.deepEqual(h.swaps, { p1: 'face_a' });
  assert.equal(h.canRedo, true);

  h.commit({ p1: 'face_c' });
  assert.deepEqual(h.swaps, { p1: 'face_c' });
  assert.equal(h.canRedo, false); // Redo stack must be cleared on new mutation
});
