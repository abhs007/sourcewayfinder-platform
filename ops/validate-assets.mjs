import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

// Catch the hostname-source rule rejected by the Workers upload API (100324).
// External destinations are supported; only the source must be a relative path.
export function validateRedirectSources(text, name = '_redirects') {
  for (const [index, line] of text.split(/\r?\n/).entries()) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const [source] = trimmed.split(/\s+/);
    if (!source.startsWith('/') || source.startsWith('//')) {
      throw Error(
        `${name}:${index + 1}: redirect source must be a relative path; handle hostname redirects in the Worker`,
      );
    }
  }
}

export async function validateAssetRedirects(root) {
  for (const asset of ['web', 'admin']) {
    const path = `dist/${asset}/_redirects`;
    let text;
    try {
      text = await readFile(resolve(root, path), 'utf8');
    } catch (error) {
      if (error.code === 'ENOENT') continue;
      throw error;
    }
    validateRedirectSources(text, path);
  }
}
