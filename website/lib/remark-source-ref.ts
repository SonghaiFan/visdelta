import { relative } from 'node:path';

interface SourceNode {
  type: string;
  position?: { start: { line: number; column: number }; end: { line: number; column: number } };
  data?: { hProperties?: Record<string, unknown> };
  children?: SourceNode[];
}

/** Blocks the dev-only inline editor can open. Nested ones win on click. */
const EDITABLE = new Set(['paragraph', 'heading', 'table']);

/**
 * Development only: stamp each editable block with where it came from,
 * `data-vd-src="content/docs/page.mdx#12:1-14:20"` (1-based lines and columns,
 * end exclusive). fumadocs-mdx compiles the body with its frontmatter replaced
 * by blank lines, so lines and columns match the file on disk.
 */
export function remarkSourceRef() {
  return (tree: SourceNode, file: { path?: string }) => {
    if (!file.path) return;
    const path = relative(process.cwd(), file.path).split('\\').join('/');
    const visit = (node: SourceNode) => {
      if (EDITABLE.has(node.type) && node.position) {
        const { start, end } = node.position;
        node.data ??= {};
        node.data.hProperties = {
          ...node.data.hProperties,
          'data-vd-src': `${path}#${start.line}:${start.column}-${end.line}:${end.column}`,
        };
      }
      node.children?.forEach(visit);
    };
    visit(tree);
  };
}
