// Small pill toggle — used anywhere a plain on/off beats a button plus a
// paragraph explaining what the button does (put the explanation behind an
// InfoButton instead).
export function Switch({ checked, onChange, label, disabled = false }) {
  return (
    <label
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 8,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.5 : 1,
      }}
    >
      <span
        style={{
          position: 'relative',
          width: 36,
          height: 21,
          borderRadius: 999,
          background: checked ? 'var(--primary)' : 'var(--border)',
          transition: 'background 0.15s',
          flexShrink: 0,
          display: 'inline-block',
        }}
      >
        <input
          type="checkbox"
          checked={checked}
          disabled={disabled}
          onChange={(e) => onChange(e.target.checked)}
          style={{ position: 'absolute', inset: 0, opacity: 0, margin: 0, cursor: disabled ? 'default' : 'pointer' }}
        />
        <span
          style={{
            position: 'absolute',
            top: 2,
            left: checked ? 17 : 2,
            width: 17,
            height: 17,
            borderRadius: '50%',
            background: '#fff',
            transition: 'left 0.15s',
            boxShadow: '0 1px 2px rgba(0,0,0,0.25)',
          }}
        />
      </span>
      {label && <span style={{ fontSize: 13, fontWeight: 600 }}>{label}</span>}
    </label>
  )
}
