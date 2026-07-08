const OWNER_RE = /^[A-Za-z0-9](?:[A-Za-z0-9-]*[A-Za-z0-9])?$/;
const REPO_RE = /^[A-Za-z0-9._-]+$/;

export interface ValidRepo {
  /** canonical clone URL: https://github.com/<owner>/<repo>.git */
  normalizedUrl: string;
  owner: string;
  repo: string;
}

export type ValidationResult = { ok: true; value: ValidRepo } | { ok: false; reason: string };

/**
 * Accepts only well-formed public github.com HTTPS repo URLs.
 * Rejects SSH URLs, embedded credentials/tokens, non-github hosts, and
 * anything that isn't exactly /<owner>/<repo>.
 */
export function validateGithubUrl(raw: unknown): ValidationResult {
  if (typeof raw !== 'string' || raw.trim() === '') {
    return { ok: false, reason: 'repoUrl is required' };
  }
  const trimmed = raw.trim();

  if (/^(git@|ssh:)/i.test(trimmed)) {
    return { ok: false, reason: 'SSH URLs are not supported — use a public https://github.com/<owner>/<repo> URL' };
  }

  let url: URL;
  try {
    url = new URL(trimmed);
  } catch {
    return { ok: false, reason: 'repoUrl is not a valid URL' };
  }

  if (url.protocol !== 'https:') {
    return { ok: false, reason: 'Only https:// GitHub URLs are supported' };
  }
  if (url.username || url.password) {
    // Credentials or tokens in the URL usually mean a private repo — out of scope.
    return { ok: false, reason: 'URLs with embedded credentials are not supported (private repos are out of scope)' };
  }

  const host = url.hostname.toLowerCase();
  if (host !== 'github.com' && host !== 'www.github.com') {
    return { ok: false, reason: 'Only public github.com repositories are supported' };
  }

  const segments = url.pathname.split('/').filter(Boolean);
  if (segments.length !== 2) {
    return { ok: false, reason: 'Expected a repository URL like https://github.com/<owner>/<repo>' };
  }

  const owner = segments[0];
  const repo = segments[1].replace(/\.git$/i, '');
  if (!OWNER_RE.test(owner) || !REPO_RE.test(repo) || repo === '.' || repo === '..') {
    return { ok: false, reason: 'Owner or repository name contains invalid characters' };
  }

  return {
    ok: true,
    value: { normalizedUrl: `https://github.com/${owner}/${repo}.git`, owner, repo },
  };
}
