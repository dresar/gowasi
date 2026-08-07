import type { ReactNode } from 'react'

interface PageHeaderProps {
  title: ReactNode
  description?: ReactNode
  icon?: ReactNode
  iconBg?: string
  actions?: ReactNode
}

export function PageHeader({
  title,
  description,
  icon,
  iconBg = 'from-primary to-primary/80',
  actions,
}: PageHeaderProps) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 pb-2 border-b border-border/40">
      <div className="flex items-center gap-3.5">
        {icon && (
          <div
            className={`flex size-11 items-center justify-center rounded-2xl bg-gradient-to-br ${iconBg} text-white shadow-md shrink-0`}
          >
            {icon}
          </div>
        )}
        <div className="flex flex-col gap-0.5">
          <h1 className="text-2xl font-bold tracking-tight text-foreground flex items-center gap-2">
            {title}
          </h1>
          {description && (
            <p className="text-muted-foreground text-sm font-normal">{description}</p>
          )}
        </div>
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  )
}
