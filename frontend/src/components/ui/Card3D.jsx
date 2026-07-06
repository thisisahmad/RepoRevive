import { useRef, useState } from 'react'
import { motion } from 'framer-motion'

export default function Card3D({ children, className = '' }) {
  const ref = useRef(null)
  const [rotate, setRotate] = useState({ x: 0, y: 0 })
  const [glare, setGlare] = useState({ x: 50, y: 50 })

  const handleMouseMove = (e) => {
    if (!ref.current) return
    const rect = ref.current.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const centerX = rect.width / 2
    const centerY = rect.height / 2
    const rotateX = ((y - centerY) / centerY) * -8
    const rotateY = ((x - centerX) / centerX) * 8
    setRotate({ x: rotateX, y: rotateY })
    setGlare({ x: (x / rect.width) * 100, y: (y / rect.height) * 100 })
  }

  const handleMouseLeave = () => {
    setRotate({ x: 0, y: 0 })
    setGlare({ x: 50, y: 50 })
  }

  return (
    <motion.div
      ref={ref}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
      animate={{
        rotateX: rotate.x,
        rotateY: rotate.y,
      }}
      transition={{ type: 'spring', stiffness: 300, damping: 20 }}
      className={`perspective-1000 group ${className}`}
      style={{ transformStyle: 'preserve-3d' }}
    >
      <div className="glow-border relative h-full rounded-2xl">
        <div
          className="relative h-full overflow-hidden rounded-2xl glass transition-shadow duration-500 hover:shadow-glow"
          style={{ transform: 'translateZ(20px)' }}
        >
          <div
            className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-500 group-hover:opacity-100"
            style={{
              background: `radial-gradient(circle at ${glare.x}% ${glare.y}%, rgba(20, 245, 198, 0.12), transparent 60%)`,
            }}
          />
          {children}
        </div>
      </div>
    </motion.div>
  )
}
