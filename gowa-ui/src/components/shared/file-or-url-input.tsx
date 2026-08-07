import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export interface FileOrUrl {
  file?: File
  url: string
}

export function FileOrUrlInput({
  label,
  accept,
  value,
  onChange,
}: {
  label: string
  accept?: string
  value: FileOrUrl
  onChange: (value: FileOrUrl) => void
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2">
        <Label>{label} — upload</Label>
        <Input
          type="file"
          accept={accept}
          onChange={(event) => onChange({ ...value, file: event.target.files?.[0] })}
        />
        {value.file && <p className="text-muted-foreground text-xs">{value.file.name}</p>}
      </div>
      <div className="flex flex-col gap-2">
        <Label>…or {label.toLowerCase()} URL</Label>
        <Input
          placeholder="https://example.com/media"
          value={value.url}
          onChange={(event) => onChange({ ...value, url: event.target.value })}
        />
      </div>
    </div>
  )
}
