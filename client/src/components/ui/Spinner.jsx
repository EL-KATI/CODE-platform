export default function Spinner({ full = false }) {
  if (full) {
    return (
      <div className="spinner-full">
        <div className="spinner" aria-label="Loading..." />
      </div>
    )
  }
  return <div className="spinner" aria-label="Loading..." />
}
