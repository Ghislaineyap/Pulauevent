// Neutral person silhouette used as the fallback inside a big photo frame
// when a freelancer hasn't uploaded a real photo yet. Same shape regardless
// of gender — only the background gradient (see avatars.js) differs.
export function Silhouette({ className = 'silhouette' }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.4">
      <circle cx="12" cy="8.2" r="4" />
      <path d="M4 20.2c0-4.6 3.6-7.2 8-7.2s8 2.6 8 7.2" />
    </svg>
  )
}
