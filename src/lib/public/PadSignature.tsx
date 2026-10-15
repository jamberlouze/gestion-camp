import { useEffect, useRef, type PointerEvent } from 'react'
import { ui } from '@/lib/ui'

// Pavé de signature des pages publiques : on signe au doigt ou à la souris.
// `changer` reçoit l'image PNG (data URL) dès qu'un trait est tracé, null
// quand on efface.

export function PadSignature({ changer, libelle = 'Signature' }: { changer: (image: string | null) => void; libelle?: string }) {
  const canevas = useRef<HTMLCanvasElement>(null)
  const dessine = useRef(false)

  // Canevas net sur écran haute densité.
  useEffect(() => {
    const c = canevas.current
    if (!c) return
    const r = window.devicePixelRatio || 1
    c.width = c.clientWidth * r
    c.height = c.clientHeight * r
    const ctx = c.getContext('2d')!
    ctx.scale(r, r)
    ctx.lineWidth = 2.2
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    ctx.strokeStyle = '#1f2937'
  }, [])

  const point = (e: PointerEvent<HTMLCanvasElement>) => {
    const b = e.currentTarget.getBoundingClientRect()
    return [e.clientX - b.left, e.clientY - b.top] as const
  }
  const debut = (e: PointerEvent<HTMLCanvasElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId)
    dessine.current = true
    const ctx = e.currentTarget.getContext('2d')!
    const [x, y] = point(e)
    ctx.beginPath()
    ctx.moveTo(x, y)
    ctx.lineTo(x + 0.1, y + 0.1)
    ctx.stroke()
  }
  const bouger = (e: PointerEvent<HTMLCanvasElement>) => {
    if (!dessine.current) return
    const ctx = e.currentTarget.getContext('2d')!
    const [x, y] = point(e)
    ctx.lineTo(x, y)
    ctx.stroke()
  }
  const fin = () => {
    if (dessine.current && canevas.current) changer(canevas.current.toDataURL('image/png'))
    dessine.current = false
  }
  const effacer = () => {
    const c = canevas.current!
    c.getContext('2d')!.clearRect(0, 0, c.width, c.height)
    changer(null)
  }

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className={ui.etiquette}>{libelle}</span>
        <button type="button" className="text-xs text-pierre-500 underline" onClick={effacer}>
          Effacer
        </button>
      </div>
      <canvas
        ref={canevas}
        className="h-40 w-full touch-none rounded-lg border border-pierre-300 bg-white"
        onPointerDown={debut}
        onPointerMove={bouger}
        onPointerUp={fin}
        onPointerLeave={fin}
      />
      <p className="mt-1 text-xs text-pierre-500">Signe avec le doigt ou la souris.</p>
    </div>
  )
}
