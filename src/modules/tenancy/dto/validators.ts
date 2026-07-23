import { MODULE_ACCESS, type ModuleName } from './constants.js';

export function validateModuleAccess(names: string[]): {
  valid: boolean;
  unknown: string[];
  duplicates: string[];
} {
  const canonicalSet = new Set<string>(MODULE_ACCESS);
  const unknown = names.filter((n) => !canonicalSet.has(n));
  const seen = new Set<string>();
  const duplicates: string[] = [];
  for (const name of names) {
    if (seen.has(name)) duplicates.push(name);
    seen.add(name);
  }
  return {
    valid: unknown.length === 0 && duplicates.length === 0,
    unknown,
    duplicates,
  };
}

export function isValidModuleName(name: string): name is ModuleName {
  return (MODULE_ACCESS as readonly string[]).includes(name);
}
