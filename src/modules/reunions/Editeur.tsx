import { TaskItem, TaskList } from '@tiptap/extension-list'
import { Placeholder } from '@tiptap/extensions'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { useCallback, useEffect, useRef, type ReactNode } from 'react'
import { versHtml } from './texteRiche'

// Éditeur de texte des Réunions (Tiptap), chargé à part : seulement quand on
// ouvre une note ou le document d'une réunion spéciale. Raccourcis : ⌘B, ⌘I,
// ⌘U ; « ## », « - », « 1. », « [ ] » en début de ligne.

type Props = {
  valeur: string | null
  /** À chaque frappe : le HTML, ou null si la note est vide. */
  changer: (v: string | null) => void
  placeholder?: string
  autoFocus?: boolean
  /** Barre d'outils au-dessus (fenêtre d'un point). Le document a la sienne. */
  barre?: boolean
  /** Classes de la zone de texte (taille, hauteur minimale). */
  className?: string
  surFocus?: (e: Editor) => void
  surBlur?: () => void
}

export default function Editeur({ valeur, changer, placeholder, autoFocus, barre, className = '', surFocus, surBlur }: Props) {
  // Dernière valeur connue de l'éditeur (la sienne ou celle reçue).
  const dernier = useRef(valeur)
  const rappels = useRef({ changer, surFocus, surBlur })
  useEffect(() => {
    rappels.current = { changer, surFocus, surBlur }
  })

  const editeur = useEditor({
    extensions: [
      StarterKit.configure({
        heading: { levels: [2, 3] },
        code: false,
        codeBlock: false,
        link: { openOnClick: false, autolink: true, defaultProtocol: 'https' },
      }),
      TaskList,
      TaskItem.configure({ nested: true }),
      Placeholder.configure({ placeholder: placeholder ?? '' }),
    ],
    content: versHtml(valeur),
    autofocus: autoFocus ? 'end' : false,
    editorProps: { attributes: { class: `texte-riche ${className}` } },
    onUpdate: ({ editor }) => {
      const v = editor.isEmpty ? null : editor.getHTML()
      dernier.current = v
      rappels.current.changer(v)
    },
    onFocus: ({ editor }) => rappels.current.surFocus?.(editor),
    onBlur: () => rappels.current.surBlur?.(),
  })

  // Changée ailleurs (autre appareil) : on la reprend, sauf pendant qu'on écrit.
  useEffect(() => {
    if (!editeur || valeur === dernier.current || editeur.isFocused) return
    dernier.current = valeur
    editeur.commands.setContent(versHtml(valeur), { emitUpdate: false })
  }, [editeur, valeur])

  return (
    <>
      {barre && <BarreOutils editeur={editeur} compacte className="-mx-1 mb-2 border-b border-pierre-100 pb-1.5" />}
      <EditorContent editor={editeur} />
    </>
  )
}

/**
 * Note enregistrée toute seule : peu après la dernière frappe, en quittant
 * le champ, en fermant le document ou l'onglet.
 */
export function NoteAuto({ enregistrer, delai = 800, ...props }: Omit<Props, 'changer'> & { enregistrer: (v: string | null) => void; delai?: number }) {
  const attente = useRef<{ v: string | null } | null>(null)
  const minuterie = useRef<ReturnType<typeof setTimeout> | null>(null)
  const envoyer = useRef(enregistrer)
  useEffect(() => {
    envoyer.current = enregistrer
  })
  const vider = useCallback(() => {
    if (minuterie.current) clearTimeout(minuterie.current)
    minuterie.current = null
    const a = attente.current
    attente.current = null
    if (a) envoyer.current(a.v)
  }, [])
  useEffect(() => {
    window.addEventListener('pagehide', vider)
    return () => {
      window.removeEventListener('pagehide', vider)
      vider()
    }
  }, [vider])

  return (
    <Editeur
      {...props}
      changer={(v) => {
        attente.current = { v }
        if (minuterie.current) clearTimeout(minuterie.current)
        minuterie.current = setTimeout(vider, delai)
      }}
      surBlur={() => {
        vider()
        props.surBlur?.()
      }}
    />
  )
}

/** Barre d'outils ; agit sur l'éditeur donné (dans le document : le dernier où l'on a écrit). */
export function BarreOutils({ editeur, compacte, className = '' }: { editeur: Editor | null; compacte?: boolean; className?: string }) {
  const etat = useEditorState({
    editor: editeur,
    selector: ({ editor: e }) =>
      e && {
        gras: e.isActive('bold'),
        italique: e.isActive('italic'),
        souligne: e.isActive('underline'),
        titre: e.isActive('heading', { level: 2 }),
        sousTitre: e.isActive('heading', { level: 3 }),
        puces: e.isActive('bulletList'),
        numeros: e.isActive('orderedList'),
        cases: e.isActive('taskList'),
      },
  })
  const faire = (action: (e: Editor) => void) => editeur && !editeur.isDestroyed && action(editeur)

  return (
    <div className={`sans-barre flex items-center gap-0.5 overflow-x-auto ${className}`} role="toolbar" aria-label="Mise en forme">
      <Outil actif={etat?.gras} titre="Gras (⌘B)" desactive={!editeur} faire={() => faire((e) => e.chain().focus().toggleBold().run())}>
        <span className="font-bold">G</span>
      </Outil>
      <Outil actif={etat?.italique} titre="Italique (⌘I)" desactive={!editeur} faire={() => faire((e) => e.chain().focus().toggleItalic().run())}>
        <span className="font-serif italic">I</span>
      </Outil>
      <Outil actif={etat?.souligne} titre="Souligné (⌘U)" desactive={!editeur} faire={() => faire((e) => e.chain().focus().toggleUnderline().run())}>
        <span className="underline">S</span>
      </Outil>
      <Separateur />
      <Outil actif={etat?.titre} titre="Titre (## au début d'une ligne)" desactive={!editeur} faire={() => faire((e) => e.chain().focus().toggleHeading({ level: 2 }).run())}>
        Titre
      </Outil>
      <Outil actif={etat?.sousTitre} titre="Sous-titre (### au début d'une ligne)" desactive={!editeur} faire={() => faire((e) => e.chain().focus().toggleHeading({ level: 3 }).run())}>
        Sous-titre
      </Outil>
      <Separateur />
      <Outil actif={etat?.puces} titre="Liste à puces (- au début d'une ligne)" desactive={!editeur} faire={() => faire((e) => e.chain().focus().toggleBulletList().run())}>
        {compacte ? '•' : '• Liste'}
      </Outil>
      <Outil actif={etat?.numeros} titre="Liste numérotée (1. au début d'une ligne)" desactive={!editeur} faire={() => faire((e) => e.chain().focus().toggleOrderedList().run())}>
        {compacte ? '1.' : '1. Liste'}
      </Outil>
      <Outil actif={etat?.cases} titre="Cases à cocher ([ ] au début d'une ligne)" desactive={!editeur} faire={() => faire((e) => e.chain().focus().toggleTaskList().run())}>
        {compacte ? '☐' : '☐ À faire'}
      </Outil>
    </div>
  )
}

function Outil({ actif, titre, desactive, faire, children }: { actif?: boolean; titre: string; desactive: boolean; faire: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      title={titre}
      aria-label={titre}
      aria-pressed={!!actif}
      disabled={desactive}
      // Garder le curseur dans le texte.
      onMouseDown={(e) => e.preventDefault()}
      onClick={faire}
      className={`shrink-0 whitespace-nowrap rounded-md px-2 py-1 text-sm disabled:opacity-40 ${
        actif ? 'bg-foret-50 text-foret-800 ring-1 ring-foret-600/30' : 'text-pierre-700 hover:bg-pierre-100'
      }`}
    >
      {children}
    </button>
  )
}

const Separateur = () => <span className="mx-1 h-5 w-px shrink-0 bg-pierre-200" aria-hidden />
