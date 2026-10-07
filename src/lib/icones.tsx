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

export const IconeAttention = (p: Props) => (
  <Icone {...p}>
    <path d="M12 4 2.5 20h19L12 4ZM12 10v4.5M12 17.5v.01" />
  </Icone>
)

export const IconeChevron = (p: Props) => (
  <Icone {...p}>
    <path d="m9 6 6 6-6 6" />
  </Icone>
)

export const IconeMenu = (p: Props) => (
  <Icone {...p}>
    <path d="M4 3v6a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2V3M7 3v18" />
    <path d="M20 15V3a4 4 0 0 0-4 4v6a2 2 0 0 0 2 2h2Zm0 0v6" />
  </Icone>
)

export const IconeRecettes = (p: Props) => (
  <Icone {...p}>
    <path d="M12 7v14" />
    <path d="M3 18V4h5a4 4 0 0 1 4 4 4 4 0 0 1 4-4h5v14h-6a3 3 0 0 0-3 3 3 3 0 0 0-3-3Z" />
  </Icone>
)

/** Reçu (coût par assiette). */
export const IconeRecu = (p: Props) => (
  <Icone {...p}>
    <path d="M5 21V4a1 1 0 0 1 1-1h12a1 1 0 0 1 1 1v17l-3-2-2 2-2-2-2 2-2-2Z" />
    <path d="M9 8h6M9 12h6M9 16h3" />
  </Icone>
)

export const IconePersonnel = (p: Props) => (
  <Icone {...p}>
    <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
    <circle cx="9" cy="7" r="4" />
    <path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
  </Icone>
)

/** Trois traits : ouvre le menu de navigation (téléphone). */
export const IconeTroisTraits = (p: Props) => (
  <Icone {...p}>
    <path d="M4 6h16M4 12h16M4 18h16" />
  </Icone>
)

export const IconeFermer = (p: Props) => (
  <Icone {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Icone>
)

export const IconeDeconnexion = (p: Props) => (
  <Icone {...p}>
    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
    <path d="m16 17 5-5-5-5M21 12H9" />
  </Icone>
)

/** Barre latérale avec une flèche : réduire / déployer le menu. */
export const IconeReduireMenu = (p: Props) => (
  <Icone {...p}>
    <rect x="3" y="3" width="18" height="18" rx="2" />
    <path d="M9 3v18M16 15l-3-3 3-3" />
  </Icone>
)
