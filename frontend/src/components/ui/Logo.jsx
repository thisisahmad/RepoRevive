export default function Logo({ size = 32, textClass = 'text-lg' }) {
  return (
    <>
      <img src="/logo-192.png" alt="RepoRevive" width={size} height={size} className="shrink-0" />
      <span className={`font-display ${textClass} font-bold tracking-tight`}>
        Repo<span className="text-accent">Revive</span>
      </span>
    </>
  )
}
