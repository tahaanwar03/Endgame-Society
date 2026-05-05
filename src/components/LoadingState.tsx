export function LoadingState({ label = "Loading data" }: { label?: string }) {
  return (
    <div className="border border-neutral-800 bg-surface-container-low p-6 text-sm text-on-surface-variant">
      {label}...
    </div>
  );
}

export function EmptyState({ title, detail }: { title: string; detail?: string }) {
  return (
    <div className="border border-dashed border-outline-variant bg-surface-container-low p-6">
      <h2 className="font-serif text-xl text-on-surface">{title}</h2>
      {detail ? <p className="mt-2 text-sm text-on-surface-variant">{detail}</p> : null}
    </div>
  );
}
