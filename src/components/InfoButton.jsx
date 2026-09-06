import { useState } from 'react'
import { Modal } from './Modal'

// A small "ⓘ" next to a label that opens a popup with the explanation,
// instead of a permanent paragraph of helper text sitting on the page.
export function InfoButton({ title, children }) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`About ${title}`}
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--muted)',
          fontSize: 14,
          padding: 0,
          marginLeft: 6,
          lineHeight: 1,
          verticalAlign: 'middle',
        }}
      >
        ⓘ
      </button>
      {open && (
        <Modal title={title} onClose={() => setOpen(false)}>
          <div style={{ fontSize: 13.5, lineHeight: 1.5 }}>{children}</div>
        </Modal>
      )}
    </>
  )
}
