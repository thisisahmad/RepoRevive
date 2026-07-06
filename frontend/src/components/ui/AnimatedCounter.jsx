import { useEffect, useRef, useState } from 'react'
import { motion, useInView } from 'framer-motion'

function easeOutExpo(t) {
  return t === 1 ? 1 : 1 - Math.pow(2, -10 * t)
}

export default function AnimatedCounter({
  value,
  suffix = '',
  prefix = '',
  duration = 2,
  className = '',
}) {
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, margin: '-80px' })
  const [display, setDisplay] = useState(0)

  useEffect(() => {
    if (!isInView) return

    let start = null
    let raf

    const animate = (timestamp) => {
      if (!start) start = timestamp
      const progress = Math.min((timestamp - start) / (duration * 1000), 1)
      setDisplay(Math.floor(easeOutExpo(progress) * value))
      if (progress < 1) raf = requestAnimationFrame(animate)
    }

    raf = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(raf)
  }, [isInView, value, duration])

  return (
    <motion.span
      ref={ref}
      className={className}
      initial={{ opacity: 0, y: 20 }}
      animate={isInView ? { opacity: 1, y: 0 } : {}}
      transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
    >
      {prefix}
      {display.toLocaleString()}
      {suffix}
    </motion.span>
  )
}
