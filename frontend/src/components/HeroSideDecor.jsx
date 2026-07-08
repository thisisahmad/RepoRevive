// Floating labels/particles for the wide side margins around the hero on
// large screens. Pure CSS `animate-float` (Tailwind's existing translateY
// keyframe) staggered per element via animationDelay — no scroll listeners,
// no JS loop, just a handful of compositor-driven transforms.
const SNIPPETS = [
  { text: '$ git clone', x: '5%', y: '16%', delay: '0s', rotate: -8 },
  { text: 'npm install', x: '90%', y: '12%', delay: '1.2s', rotate: 6 },
  { text: 'ERR! deprecated', x: '87%', y: '38%', delay: '2.4s', rotate: -5 },
  { text: '✓ patched', x: '7%', y: '44%', delay: '0.6s', rotate: 10 },
  { text: 'webpack → v5', x: '3%', y: '68%', delay: '3s', rotate: -12 },
  { text: 'npm run build', x: '91%', y: '64%', delay: '1.8s', rotate: 7 },
  { text: 'revived', x: '9%', y: '86%', delay: '3.6s', rotate: 9 },
  { text: '$ node server.js', x: '85%', y: '84%', delay: '0.9s', rotate: -9 },
]

const DOTS = [
  { x: '14%', y: '26%', size: 4, delay: '0s' },
  { x: '84%', y: '24%', size: 3, delay: '1.5s' },
  { x: '18%', y: '58%', size: 3, delay: '2.7s' },
  { x: '82%', y: '52%', size: 4, delay: '0.9s' },
  { x: '12%', y: '76%', size: 2, delay: '2.1s' },
  { x: '89%', y: '72%', size: 3, delay: '3.3s' },
]

export default function HeroSideDecor() {
  return (
    <div
      className="pointer-events-none absolute inset-0 hidden overflow-hidden lg:block"
      aria-hidden="true"
    >
      {SNIPPETS.map((s, i) => (
        // Outer span holds the static tilt; animate-float's keyframes fully
        // replace `transform` on whatever element they're applied to, so the
        // rotation has to live one level up or it gets clobbered mid-bob.
        <span key={i} className="absolute" style={{ left: s.x, top: s.y, transform: `rotate(${s.rotate}deg)` }}>
          <span
            className="animate-float block font-mono text-xs uppercase tracking-widest text-accent/60"
            style={{
              animationDelay: s.delay,
              textShadow: '0 0 16px rgba(20, 245, 198, 0.5), 0 0 32px rgba(20, 245, 198, 0.2)',
            }}
          >
            {s.text}
          </span>
        </span>
      ))}

      {DOTS.map((d, i) => (
        <span
          key={i}
          className="animate-float absolute rounded-full bg-accent/70"
          style={{
            left: d.x,
            top: d.y,
            width: d.size,
            height: d.size,
            animationDelay: d.delay,
            boxShadow: '0 0 10px rgba(20, 245, 198, 0.8)',
          }}
        />
      ))}
    </div>
  )
}
