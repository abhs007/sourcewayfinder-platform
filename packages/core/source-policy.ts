// Finite acquisition profiles; never controlled by retrieved HTML.
export const DEFAULT_SOURCE_BYTES = 1024 * 1024;
export const GOOGLE_HELP_SOURCE_BYTES = 2 * 1024 * 1024;
const googlePaths = new Set([
  '/accounts/answer/185834',
  '/accounts/answer/6294825',
  '/accounts/answer/7682439',
]);
type Boundary = { url: string; approvedOrigin: string; approvedPath: string };

function googleEnglishDocument(url: URL) {
  return (
    url.origin === 'https://support.google.com' &&
    googlePaths.has(url.pathname) &&
    url.search === '?hl=en' &&
    !url.username &&
    !url.password &&
    !url.port &&
    !url.hash
  );
}

export function sourceQueryAllowed(url: URL) {
  return !url.search || googleEnglishDocument(url);
}

export function sourceDocumentLimit(source: Boundary) {
  const url = new URL(source.url);
  return googleEnglishDocument(url) &&
    source.approvedOrigin === url.origin &&
    source.approvedPath === url.pathname
    ? GOOGLE_HELP_SOURCE_BYTES
    : DEFAULT_SOURCE_BYTES;
}
