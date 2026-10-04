export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: React.ReactNode }) {
  return (
    <header className="enter flex flex-wrap items-end justify-between gap-4 pb-6" style={{ ["--i" as string]: 0 }}>
      <div className="min-w-0 max-w-2xl">
        <h1 className="text-[1.75rem] font-semibold leading-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1.5 text-[15px] leading-relaxed text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </header>
  );
}
