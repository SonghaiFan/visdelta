/** Build the two-cell authoring contract used by every transition lab. */
export function transitionScenario({ id, category, label, description, setup, from, to }) {
  const dataUrl = setup.match(/const DATA_URL = ["']([^"']+)["'];/)?.[1] ?? null;
  const visibleSetup = setup
    .replace(/^const DATA_URL = ["'][^"']+["'];\s*/m, '')
    .replace(/^const rows = await d3\.csv\(DATA_URL, d3\.autoType\);\s*/m, '')
    .replaceAll('{ url: DATA_URL }', 'rows')
    .trim();
  return {
    id, category, label, description, dataUrl,
    code: stateCell('from', visibleSetup, from),
    toCode: stateCell('to', visibleSetup, to)
  };
}

function stateCell(name, setup, expression) {
  return `const ${name} = ${expandState(expression, setup)};`;
}

function expandState(expression, setup) {
  const declarations = new Map();
  for (const match of setup.matchAll(/^const\s+([A-Za-z_$][\w$]*)\s*=\s*([\s\S]*?);(?=\n|$)/gm)) {
    declarations.set(match[1], match[2].trim());
  }

  let expanded = expression.trim();
  const resolving = new Set();
  const resolve = name => {
    if (!declarations.has(name) || resolving.has(name)) return name;
    resolving.add(name);
    let value = declarations.get(name);
    value = expandLeading(value);
    value = replaceDependencies(value);
    resolving.delete(name);
    return value;
  };
  const expandLeading = value => {
    const leading = value.match(/^([A-Za-z_$][\w$]*)(?=\s*\.|$)/)?.[1];
    if (!leading || !declarations.has(leading)) return value;
    return `${resolve(leading)}${value.slice(leading.length)}`;
  };
  const replaceDependencies = value => {
    return replaceDeclaredIdentifiers(value, declarations, name => {
      const dependency = resolve(name);
      return /^[\[{"'`]|^(?:true|false|null|[-+]?\d)/.test(dependency)
        ? dependency
        : `(${dependency})`;
    });
  };

  expanded = expandLeading(expanded);
  expanded = replaceDependencies(expanded);
  return pruneOverriddenCalls(expanded
    .replace(/^\(([^\n]+)\)(?=\.)/, '$1')
    .replace(/\)\.(?=[A-Za-z_$])/g, ')\n  .'));
}

function pruneOverriddenCalls(source) {
  const setters = new Set(['x', 'y', 'color', 'size', 'radius', 'curve', 'strokeWidth', 'pointSize', 'baseline', 'layout']);
  const lines = source.split('\n');
  const methods = lines.map(line => line.match(/^\s*\.([A-Za-z_$][\w$]*)\(/)?.[1] ?? null);
  return lines.filter((line, index) => {
    const method = methods[index];
    return !method || !setters.has(method) || !methods.slice(index + 1).includes(method);
  }).join('\n');
}

function replaceDeclaredIdentifiers(source, declarations, replacement) {
  let output = '';
  for (let index = 0; index < source.length;) {
    const character = source[index];
    if (character === '"' || character === "'" || character === '`') {
      const quote = character;
      const start = index++;
      while (index < source.length) {
        if (source[index] === '\\') { index += 2; continue; }
        if (source[index++] === quote) break;
      }
      output += source.slice(start, index);
      continue;
    }
    if (/[A-Za-z_$]/.test(character)) {
      const start = index++;
      while (index < source.length && /[\w$]/.test(source[index])) index += 1;
      const name = source.slice(start, index);
      const previous = source.slice(0, start).match(/\S\s*$/)?.[0]?.trim();
      const next = source.slice(index).match(/^\s*(.)/)?.[1];
      const isProperty = previous === '.' || next === ':';
      output += declarations.has(name) && !isProperty ? replacement(name) : name;
      continue;
    }
    output += character;
    index += 1;
  }
  return output;
}
