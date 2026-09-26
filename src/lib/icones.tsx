import type { ReactNode, SVGProps } from 'react'

// Petites icônes au trait (couleur du texte). Taille par défaut : size-4.
type Props = SVGProps<SVGSVGElement>

function Icone({ children, className = 'size-4', ...props }: Props & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className={`shrink-0 ${className}`}
      {...props}
    >
      {children}
    </svg>
  )
}

export const IconePlus = (p: Props) => (
  <Icone {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icone>
)

export const IconeDupliquer = (p: Props) => (
  <Icone {...p}>
    <rect x="8" y="8" width="12" height="12" rx="2" />
    <path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2" />
  </Icone>
)

export const IconeRenommer = (p: Props) => (
  <Icone {...p}>
    <path d="M4 20h4L18.5 9.5a2.12 2.12 0 0 0-3-3L5 17v3Z" />
    <path d="m13.5 7.5 3 3" />
  </Icone>
)

export const IconeDossier = (p: Props) => (
  <Icone {...p}>
    <path d="M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2Z" />
  </Icone>
)

export const IconeModele = (p: Props) => (
  <Icone {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M3 9h18M9 9v12" />
  </Icone>
)

export const IconeSemaine = (p: Props) => (
  <Icone {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Icone>
)

export const IconeReglages = (p: Props) => (
  <Icone {...p}>
    <path d="M4 6h9M17 6h3M4 12h3M11 12h9M4 18h11M19 18h1" />
    <circle cx="15" cy="6" r="2" />
    <circle cx="9" cy="12" r="2" />
    <circle cx="17" cy="18" r="2" />
  </Icone>
)

export const IconeImporter = (p: Props) => (
  <Icone {...p}>
    <path d="M12 15V4M7 9l5-5 5 5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Icone>
)

export const IconeExporter = (p: Props) => (
  <Icone {...p}>
    <path d="M12 4v11M7 10l5 5 5-5M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
  </Icone>
)

export const IconeTableur = (p: Props) => (
  <Icone {...p}>
    <rect x="4" y="3" width="16" height="18" rx="2" />
    <path d="M4 9h16M4 15h16M10 3v18" />
  </Icone>
)

export const IconeCorbeille = (p: Props) => (
  <Icone {...p}>
    <path d="M4 7h16M10 11v6M14 11v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3" />
  </Icone>
)

export const IconeChevron = (p: Props) => (
  <Icone {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icone>
)
