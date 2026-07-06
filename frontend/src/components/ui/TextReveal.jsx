import { motion } from 'framer-motion'

export default function TextReveal({
  text,
  className = '',
  wordClassName = '',
  delay = 0,
  as: Tag = 'span',
  splitBy = 'word',
}) {
  const units = splitBy === 'letter' ? text.split('') : text.split(' ')

  const container = {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: splitBy === 'letter' ? 0.03 : 0.08,
        delayChildren: delay,
      },
    },
  }

  const child = {
    hidden: {
      opacity: 0,
      y: splitBy === 'letter' ? 20 : 40,
      rotateX: splitBy === 'letter' ? 0 : -15,
    },
    visible: {
      opacity: 1,
      y: 0,
      rotateX: 0,
      transition: {
        duration: 0.6,
        ease: [0.16, 1, 0.3, 1],
      },
    },
  }

  return (
    <Tag className={`block ${className}`} style={{ perspective: '1000px' }}>
      <motion.span
        variants={container}
        initial="hidden"
        animate="visible"
        className="inline-flex flex-wrap justify-center"
        aria-label={text}
      >
        {units.map((unit, i) => (
          <motion.span
            key={`${unit}-${i}`}
            variants={child}
            className={`inline-block ${wordClassName}`}
            style={{
              transformOrigin: 'bottom center',
              marginRight: splitBy === 'word' && i < units.length - 1 ? '0.35em' : 0,
            }}
            aria-hidden="true"
          >
            {unit}
          </motion.span>
        ))}
      </motion.span>
    </Tag>
  )
}
