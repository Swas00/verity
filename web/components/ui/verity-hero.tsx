'use client'

import { useEffect, useState, type ReactNode } from 'react'
import { SplineScene } from '@/components/ui/splite'
import { Card } from '@/components/ui/card'
import { Spotlight } from '@/components/ui/spotlight'

// The landing hero: a dark card with Verity's message on the left and an interactive 3D scene on the right, under a
// spotlight that follows the pointer. This is the supplied demo, filled with Verity's own words. The 3D scene is
// decoration, so it is skipped on narrow screens and for visitors who ask for less motion, and it starts a moment after
// the page is shown so it never delays the sign-in controls below it.

const SCENE = 'https://prod.spline.design/kZDDjO5HuC9GJUM2/scene.splinecode'

export interface VerityHeroProps {
  eyebrow: string
  title: ReactNode
  description: ReactNode
  /** Short labels for what Verity checks, shown under the description. */
  tags?: string[]
}

export function VerityHero({ eyebrow, title, description, tags = [] }: VerityHeroProps) {
  const [show3d, setShow3d] = useState(false)

  useEffect(() => {
    const wide = window.matchMedia('(min-width: 768px)').matches
    const calm = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (!wide || calm) return
    const t = window.setTimeout(() => setShow3d(true), 600)
    return () => window.clearTimeout(t)
  }, [])

  return (
    <Card className="relative box-border flex w-full flex-col overflow-hidden border-neutral-800 bg-black/[0.96] text-white md:h-[clamp(380px,calc(100svh_-_21rem),500px)] md:flex-row">
      <Spotlight className="-top-40 left-0 md:-top-20 md:left-60" />

      <div className="relative z-10 box-border flex flex-1 flex-col justify-center p-8">
        <p className="m-0 font-mono text-xs uppercase tracking-[0.3em] text-indigo-300">{eyebrow}</p>
        <h1 className="m-0 mt-3 bg-gradient-to-b from-neutral-50 to-neutral-400 bg-clip-text text-4xl font-bold leading-[1.05] tracking-tight text-transparent md:text-5xl">
          {title}
        </h1>
        <p className="m-0 mt-4 max-w-lg text-neutral-300">{description}</p>
        {tags.length > 0 && (
          <ul className="m-0 mt-5 flex list-none flex-wrap gap-2 p-0">
            {tags.map((tag) => (
              <li key={tag} className="rounded-full border border-solid border-neutral-700 px-3 py-1 text-xs text-neutral-200">
                {tag}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div aria-hidden="true" className="relative min-h-0 flex-1">
        {show3d ? <SplineScene scene={SCENE} className="h-full w-full" /> : null}
      </div>
    </Card>
  )
}
