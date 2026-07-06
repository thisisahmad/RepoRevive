import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

export default function MagneticButton({
  children,
  className = '',
  variant = 'primary',
  onClick,
  href,
}) {
  const ref = useRef(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })

  const handleMouseMove = (e) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left - rect.width / 2
    const y = e.clientY - rect.top - rect.height / 2
    setPosition({ x: x * 0.25, y: y * 0.25 })
  }

  const handleMouseLeave = () => setPosition({ x: 0, y: 0 })

  const baseStyles =
    'relative inline-flex items-center justify-center gap-2 rounded-full px-8 py-3.5 font-display text-sm font-semibold tracking-wide transition-shadow duration-300'

  const variants = {
    primary:
      'bg-accent text-background shadow-glow-accent hover:shadow-glow-lg',
    secondary:
      'glass text-foreground hover:border-accent/30 hover:shadow-glow',
    ghost:
      'text-muted hover:text-foreground',
  }

  const Component = href ? 'a' : 'button'
  const props = href ? { href } : { onClick, type: 'button' }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{ x: position.x, y: position.y }}
      transition={{ type: 'spring', stiffness: 150, damping: 15, mass: 0.1 }}
      className="inline-block"
    >
      <Component
        {...props}
        className={`${baseStyles} ${variants[variant]} ${className} group`}
      >
        <span className="relative z-10">{children}</span>
        {variant === 'primary' && (
          <span className="absolute inset-0 rounded-full bg-accent opacity-0 blur-xl transition-opacity duration-300 group-hover:opacity-40" />
        )}
      </Component>
    </motion.div>
  )
}
