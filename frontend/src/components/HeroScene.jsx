import { useRef, useMemo } from 'react'
import { Canvas, useFrame } from '@react-three/fiber'
import * as THREE from 'three'

function StabilizingWireframe({ mouse }) {
  const meshRef = useRef()
  const progressRef = useRef(0)
  const originalPositions = useRef(null)
  const scatterTargets = useRef(null)

  useMemo(() => {
    const geo = new THREE.IcosahedronGeometry(2, 1)
    const pos = geo.attributes.position
    originalPositions.current = new Float32Array(pos.array)
    scatterTargets.current = new Float32Array(pos.count * 3)

    for (let i = 0; i < pos.count; i++) {
      scatterTargets.current[i * 3] = (Math.random() - 0.5) * 8
      scatterTargets.current[i * 3 + 1] = (Math.random() - 0.5) * 8
      scatterTargets.current[i * 3 + 2] = (Math.random() - 0.5) * 8
    }
  }, [])

  useFrame((_, delta) => {
    if (!meshRef.current) return

    progressRef.current = Math.min(progressRef.current + delta * 0.35, 1)
    const t = 1 - Math.pow(1 - progressRef.current, 3)
    const glitch = (1 - t) * 0.12
    const time = performance.now() * 0.001

    const geo = meshRef.current.geometry
    const pos = geo.attributes.position

    for (let i = 0; i < pos.count; i++) {
      const ox = originalPositions.current[i * 3]
      const oy = originalPositions.current[i * 3 + 1]
      const oz = originalPositions.current[i * 3 + 2]
      const sx = scatterTargets.current[i * 3]
      const sy = scatterTargets.current[i * 3 + 1]
      const sz = scatterTargets.current[i * 3 + 2]

      pos.array[i * 3] = sx + (ox - sx) * t + Math.sin(time * 18 + i) * glitch
      pos.array[i * 3 + 1] = sy + (oy - sy) * t + Math.cos(time * 15 + i * 1.5) * glitch
      pos.array[i * 3 + 2] = sz + (oz - sz) * t + Math.sin(time * 12 + i * 0.7) * glitch
    }
    pos.needsUpdate = true
    geo.computeVertexNormals()

    meshRef.current.rotation.y += delta * 0.18
    meshRef.current.rotation.x = Math.sin(time * 0.4) * 0.12 * t

    if (mouse.current) {
      meshRef.current.rotation.y += mouse.current.x * 0.004
      meshRef.current.rotation.x += mouse.current.y * 0.003
    }

    meshRef.current.material.opacity = 0.55 + t * 0.35
  })

  return (
    <mesh ref={meshRef}>
      <icosahedronGeometry args={[2, 1]} />
      <meshBasicMaterial
        color="#14F5C6"
        wireframe
        transparent
        opacity={0.55}
      />
    </mesh>
  )
}

function GlowPoints({ mouse }) {
  const pointsRef = useRef()
  const progressRef = useRef(0)

  const particles = useMemo(() => {
    const count = 40
    const positions = new Float32Array(count * 3)
    const targets = new Float32Array(count * 3)
    for (let i = 0; i < count; i++) {
      const theta = Math.random() * Math.PI * 2
      const phi = Math.acos(2 * Math.random() - 1)
      const r = 2.2
      targets[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      targets[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      targets[i * 3 + 2] = r * Math.cos(phi)
      positions[i * 3] = (Math.random() - 0.5) * 10
      positions[i * 3 + 1] = (Math.random() - 0.5) * 10
      positions[i * 3 + 2] = (Math.random() - 0.5) * 10
    }
    return { positions, targets, count }
  }, [])

  useFrame((_, delta) => {
    if (!pointsRef.current) return
    progressRef.current = Math.min(progressRef.current + delta * 0.35, 1)
    const t = 1 - Math.pow(1 - progressRef.current, 3)
    const pos = pointsRef.current.geometry.attributes.position

    for (let i = 0; i < particles.count; i++) {
      pos.array[i * 3] += (particles.targets[i * 3] - pos.array[i * 3]) * delta * 2
      pos.array[i * 3 + 1] += (particles.targets[i * 3 + 1] - pos.array[i * 3 + 1]) * delta * 2
      pos.array[i * 3 + 2] += (particles.targets[i * 3 + 2] - pos.array[i * 3 + 2]) * delta * 2
    }
    pos.needsUpdate = true

    pointsRef.current.rotation.y += delta * 0.18
    if (mouse.current) {
      pointsRef.current.rotation.y += mouse.current.x * 0.004
      pointsRef.current.rotation.x += mouse.current.y * 0.003
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          count={particles.count}
          array={particles.positions}
          itemSize={3}
        />
      </bufferGeometry>
      <pointsMaterial color="#14F5C6" size={0.06} transparent opacity={0.8} sizeAttenuation />
    </points>
  )
}

function Scene({ mouse }) {
  return (
    <>
      <ambientLight intensity={0.15} />
      <pointLight position={[4, 4, 4]} intensity={0.6} color="#14F5C6" />
      <StabilizingWireframe mouse={mouse} />
      <GlowPoints mouse={mouse} />
    </>
  )
}

export default function HeroScene() {
  const mouse = useRef({ x: 0, y: 0 })

  const handlePointerMove = (e) => {
    const rect = e.currentTarget.getBoundingClientRect()
    mouse.current = {
      x: ((e.clientX - rect.left) / rect.width) * 2 - 1,
      y: -((e.clientY - rect.top) / rect.height) * 2 + 1,
    }
  }

  return (
    <div className="absolute inset-0" onPointerMove={handlePointerMove}>
      <Canvas
        camera={{ position: [0, 0, 6.5], fov: 42 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: true }}
        style={{ background: 'transparent' }}
      >
        <Scene mouse={mouse} />
      </Canvas>
    </div>
  )
}
