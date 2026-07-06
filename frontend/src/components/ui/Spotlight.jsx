import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

export default function Spotlight({ className = '', children }) {
  const containerRef = useRef(null)
  const [position, setPosition] = useState({ x: 0, y: 0 })
  const [opacity, setOpacity] = useState(0)

  const handleMouseMove = (e) => {
    if (!containerRef.current) return
    const rect = containerRef.current.getBoundingClientRect()
    setPosition({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    })
  }

  return (
    <div
      ref={containerRef}
      onMouseMove={handleMouseMove}
      onMouseEnter={() => setOpacity(1)}
      onMouseLeave={() => setOpacity(0)}
      className={`relative overflow-hidden ${className}`}
    >
      <motion.div
        className="pointer-events-none absolute -inset-px z-0"
        animate={{ opacity }}
        transition={{ duration: 0.3 }}
        style={{
          background: `radial-gradient(600px circle at ${position.x}px ${position.y}px, rgba(20, 245, 198, 0.08), transparent 40%)`,
        }}
      />
      <div className="relative z-10">{children}</div>
    </div>
  )
}
