/**
 * RinaOS's icons, drawn (no icon fonts or images to load): the ribbon's glyphs, the menu bar's, and
 * the dock's app icons.
 */
const S = { fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round', strokeLinejoin: 'round' } as const

export function Glyph({ name, color }: { name: string; color?: string }) {
  const p = (() => {
    switch (name) {
      case 'book':
        return (
          <>
            <rect x="4" y="3" width="12" height="14" rx="1.5" fill={color ?? '#7719aa'} />
            <rect x="6.5" y="3" width="1.4" height="14" fill="rgba(255,255,255,.55)" />
          </>
        )
      case 'chevron':
        return <path d="M6 8l4 4 4-4" {...S} />
      case 'search':
        return (
          <>
            <circle cx="9" cy="9" r="5" {...S} />
            <path d="M13 13l4 4" {...S} />
          </>
        )
      case 'plus':
        return <path d="M10 4v12M4 10h12" {...S} />
      case 'bold':
        return <text x="10" y="15" textAnchor="middle" fontSize="14" fontWeight="800" fill="currentColor" fontFamily="Georgia, serif">B</text>
      case 'italic':
        return <text x="10" y="15" textAnchor="middle" fontSize="14" fontStyle="italic" fill="currentColor" fontFamily="Georgia, serif">I</text>
      case 'underline':
        return (
          <>
            <text x="10" y="13.5" textAnchor="middle" fontSize="13" fill="currentColor" fontFamily="Georgia, serif">U</text>
            <path d="M5.5 16.5h9" {...S} />
          </>
        )
      case 'strike':
        return (
          <>
            <text x="10" y="14.5" textAnchor="middle" fontSize="13" fill="currentColor" fontFamily="Arial, sans-serif">ab</text>
            <path d="M3.5 10.5h13" {...S} />
          </>
        )
      case 'highlight':
        return <path d="M5 15l2-5 6-6 3 3-6 6-5 2zM11 6l3 3" {...S} />
      case 'fontcolor':
        return <text x="10" y="14" textAnchor="middle" fontSize="14" fill="currentColor" fontFamily="Georgia, serif">A</text>
      case 'clear':
        return (
          <>
            <text x="8" y="14" textAnchor="middle" fontSize="12" fill="currentColor" fontFamily="Georgia, serif">A</text>
            <path d="M12 11l5 5M17 11l-5 5" {...S} />
          </>
        )
      case 'bullets':
        return (
          <>
            <circle cx="4.5" cy="6" r="1.2" fill="currentColor" />
            <circle cx="4.5" cy="10" r="1.2" fill="currentColor" />
            <circle cx="4.5" cy="14" r="1.2" fill="currentColor" />
            <path d="M8 6h9M8 10h9M8 14h9" {...S} />
          </>
        )
      case 'numbers':
        return (
          <>
            <text x="4.5" y="8" textAnchor="middle" fontSize="6" fill="currentColor">1</text>
            <text x="4.5" y="12.5" textAnchor="middle" fontSize="6" fill="currentColor">2</text>
            <text x="4.5" y="17" textAnchor="middle" fontSize="6" fill="currentColor">3</text>
            <path d="M8 6h9M8 10h9M8 14h9" {...S} />
          </>
        )
      case 'outdent':
        return <path d="M9 5h8M9 10h8M9 15h8M6 7.5L3 10l3 2.5" {...S} />
      case 'indent':
        return <path d="M9 5h8M9 10h8M9 15h8M3 7.5L6 10l-3 2.5" {...S} />
      case 'alignl':
        return <path d="M3 5h14M3 10h9M3 15h12" {...S} />
      case 'alignc':
        return <path d="M3 5h14M5.5 10h9M4 15h12" {...S} />
      case 'alignr':
        return <path d="M3 5h14M8 10h9M5 15h12" {...S} />
      case 'picture':
        return (
          <>
            <rect x="3" y="4" width="14" height="12" rx="1.5" {...S} />
            <circle cx="7.5" cy="8" r="1.5" fill="currentColor" />
            <path d="M3.5 14.5l4-4 3 3 2-2 4 4" {...S} />
          </>
        )
      case 'calendar':
        return (
          <>
            <rect x="3" y="4.5" width="14" height="12" rx="1.5" {...S} />
            <path d="M3 8.5h14M7 3v3M13 3v3" {...S} />
          </>
        )
      case 'clock':
        return (
          <>
            <circle cx="10" cy="10" r="7" {...S} />
            <path d="M10 6v4l3 2" {...S} />
          </>
        )
      case 'calclock':
        return (
          <>
            <rect x="2.5" y="4.5" width="10" height="10" rx="1.2" {...S} />
            <circle cx="14" cy="13" r="4" {...S} fill="#f6f3f8" />
            <path d="M14 11v2l1.3 1" {...S} />
          </>
        )
      case 'sticker':
        return (
          <>
            <circle cx="10" cy="10" r="7" {...S} />
            <circle cx="7.5" cy="8.5" r="0.9" fill="currentColor" />
            <circle cx="12.5" cy="8.5" r="0.9" fill="currentColor" />
            <path d="M7 12c1.5 2 4.5 2 6 0" {...S} />
          </>
        )
      case 'cursor':
        return <path d="M8 3h4M8 17h4M10 3v14" {...S} />
      case 'eraser':
        return <path d="M4 13l7-7 5 5-5 5H7zM8 16h9" {...S} />
      case 'pen':
        return (
          <>
            <path d="M5 15l1-4 7-7 3 3-7 7z" fill={color} stroke="#333" strokeWidth="0.8" />
            <path d="M5 15l1-4 3 3z" fill="#222" />
          </>
        )
      case 'marker':
        return (
          <>
            <path d="M6 16l1-5 6-6 3 3-6 6z" fill={color} stroke="#555" strokeWidth="0.8" />
            <rect x="3" y="16" width="7" height="2" fill={color} opacity="0.8" />
          </>
        )
      case 'zoomin':
        return (
          <>
            <circle cx="9" cy="9" r="5" {...S} />
            <path d="M13 13l4 4M7 9h4M9 7v4" {...S} />
          </>
        )
      case 'zoomout':
        return (
          <>
            <circle cx="9" cy="9" r="5" {...S} />
            <path d="M13 13l4 4M7 9h4" {...S} />
          </>
        )
      case 'apple':
        return (
          <path
            fill="currentColor"
            d="M13.4 10.6c0-1.6 1.3-2.4 1.4-2.4-.8-1.1-2-1.3-2.4-1.3-1-.1-2 .6-2.5.6s-1.3-.6-2.2-.6c-1.1 0-2.2.7-2.8 1.7-1.2 2.1-.3 5.2.9 6.9.6.8 1.2 1.7 2.1 1.7.8 0 1.2-.5 2.2-.5s1.3.5 2.2.5c.9 0 1.5-.8 2-1.7.6-.9.9-1.8.9-1.9 0 0-1.8-.7-1.8-3zM11.8 5.6c.5-.6.8-1.4.7-2.2-.7 0-1.5.5-2 1.1-.4.5-.8 1.3-.7 2.1.8.1 1.5-.4 2-1z"
          />
        )
      case 'wifi':
        return <path d="M3 8a10 10 0 0 1 14 0M5.5 10.7a6.5 6.5 0 0 1 9 0M8 13.3a3 3 0 0 1 4 0M10 16h.01" {...S} />
      case 'battery':
        return (
          <>
            <rect x="2" y="6" width="14" height="8" rx="2" {...S} />
            <rect x="3.6" y="7.6" width="9" height="4.8" rx="1" fill="currentColor" />
            <path d="M17.5 8.5v3" {...S} />
          </>
        )
      default:
        return null
    }
  })()
  return (
    <svg className="ros-glyph" viewBox="0 0 20 20" width="18" height="18" aria-hidden>
      {p}
    </svg>
  )
}

/** the dock's app icons (macOS-style rounded squares) */
export function AppIcon({ app }: { app: 'onenote' | 'photos' | 'music' | 'finder' }) {
  return (
    <svg viewBox="0 0 64 64" width="100%" height="100%" aria-hidden>
      <defs>
        <linearGradient id={`g-${app}`} x1="0" y1="0" x2="0" y2="1">
          {app === 'onenote' && (
            <>
              <stop offset="0" stopColor="#9b3fd1" />
              <stop offset="1" stopColor="#6a1596" />
            </>
          )}
          {app === 'photos' && (
            <>
              <stop offset="0" stopColor="#ffffff" />
              <stop offset="1" stopColor="#ececec" />
            </>
          )}
          {app === 'music' && (
            <>
              <stop offset="0" stopColor="#ff6f91" />
              <stop offset="1" stopColor="#f9245f" />
            </>
          )}
          {app === 'finder' && (
            <>
              <stop offset="0" stopColor="#6fc3ff" />
              <stop offset="1" stopColor="#1e7cf2" />
            </>
          )}
        </linearGradient>
      </defs>
      <rect x="4" y="4" width="56" height="56" rx="13" fill={`url(#g-${app})`} />
      {app === 'onenote' && (
        <>
          <rect x="30" y="15" width="22" height="34" rx="3" fill="#ffffff" opacity="0.92" />
          <path d="M34 22h14M34 28h14M34 34h14M34 40h10" stroke="#9b3fd1" strokeWidth="2" strokeLinecap="round" />
          <rect x="12" y="19" width="26" height="26" rx="4" fill="#5b0f85" />
          <text x="25" y="39" textAnchor="middle" fontSize="20" fontWeight="700" fill="#fff" fontFamily="Segoe UI, Arial, sans-serif">N</text>
        </>
      )}
      {app === 'photos' &&
        ['#ff9f0a', '#ffd60a', '#30d158', '#64d2ff', '#0a84ff', '#bf5af2', '#ff375f', '#ff6961'].map((c, i) => (
          <ellipse key={c} cx="32" cy="21" rx="6" ry="11" fill={c} opacity="0.85" transform={`rotate(${i * 45} 32 32)`} style={{ mixBlendMode: 'multiply' }} />
        ))}
      {app === 'music' && <path d="M26 44V22l18-4v22" fill="none" stroke="#fff" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round" />}
      {app === 'music' && (
        <>
          <ellipse cx="22" cy="44" rx="5" ry="4" fill="#fff" />
          <ellipse cx="40" cy="40" rx="5" ry="4" fill="#fff" />
        </>
      )}
      {app === 'finder' && (
        <>
          <path d="M32 4v56" stroke="#0b3d91" strokeWidth="1.2" opacity="0.5" />
          <circle cx="22" cy="26" r="2.5" fill="#0b2a5b" />
          <circle cx="42" cy="26" r="2.5" fill="#0b2a5b" />
          <path d="M18 40c8 6 20 6 28 0" fill="none" stroke="#0b2a5b" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
