// Lightweight bottom-sheet modal — used for things like "manage locations"
// that shouldn't permanently take up space inline on a form. Click the
// backdrop or the close button to dismiss.
export function Modal({ title, onClose, children }) {
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="row" style={{ justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: 'var(--muted)', lineHeight: 1, padding: 4 }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}
