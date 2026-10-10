import { expect } from '@playwright/test';

// Playground cells are CodeMirror editors, not form inputs. CodeMirror only
// renders visible lines, so read and replace the document through its view
// (the internal tile on .cm-content that EditorView.findFromDOM also uses).
export async function editorCode(editor) {
  return editor.evaluate(element => {
    const content = element.matches('.cm-content') ? element : element.querySelector('.cm-content');
    const view = content?.cmTile?.root?.view;
    if (!view) throw new Error('Not a CodeMirror editor');
    return view.state.doc.toString();
  });
}

/** Replace the whole document as one user edit, like Playwright's fill(). */
export async function setEditorCode(editor, code) {
  await editor.evaluate((element, next) => {
    const content = element.matches('.cm-content') ? element : element.querySelector('.cm-content');
    const view = content?.cmTile?.root?.view;
    if (!view) throw new Error('Not a CodeMirror editor');
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: next }, userEvent: 'input' });
  }, code);
}

/** Assert the document equals a string or matches a RegExp, retrying like toHaveValue. */
export async function expectEditorCode(editor, expected, { not = false } = {}) {
  const assertion = expect.poll(() => editorCode(editor));
  const target = not ? assertion.not : assertion;
  if (expected instanceof RegExp) await target.toMatch(expected);
  else await target.toBe(expected);
}

export const fromEditor = page => page.getByRole('textbox', { name: 'Editable VisDelta code', exact: true });
export const toEditor = page => page.getByRole('textbox', { name: 'Editable VisDelta to state code', exact: true });

/** Replace both authored cells; the To cell continues in the From cell's scope. */
export async function setCells(page, from, to) {
  await setEditorCode(fromEditor(page), from);
  await setEditorCode(toEditor(page), to);
}
