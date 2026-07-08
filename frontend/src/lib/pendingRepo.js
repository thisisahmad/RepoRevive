const KEY = 'reporevive:pendingRepoUrl'

export function savePendingRepoUrl(url) {
  sessionStorage.setItem(KEY, url)
}

/** Reads without clearing — for showing "you'll revive X after signing in" hints. */
export function peekPendingRepoUrl() {
  return sessionStorage.getItem(KEY)
}

/** Reads and clears the pending URL in one step, so it's only ever consumed once. */
export function takePendingRepoUrl() {
  const url = sessionStorage.getItem(KEY)
  if (url) sessionStorage.removeItem(KEY)
  return url
}
