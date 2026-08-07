import { useState, type FormEvent } from 'react'
import { stickerRequest, sendSticker } from '@/api/send'
import { FormActions } from '@/components/shared/curl-dialog'
import { FileOrUrlInput, type FileOrUrl } from '@/components/shared/file-or-url-input'
import { ResultPanel } from '@/components/shared/result-panel'
import { useActionMutation } from '@/hooks/use-action-mutation'
import { useRecipientJid } from '@/stores/recipient'

export function SendStickerForm() {
  const jid = useRecipientJid()
  const [source, setSource] = useState<FileOrUrl>({ url: '' })

  const mutation = useActionMutation(sendSticker, { successMessage: 'Sticker sent' })

  const payload = {
    phone: jid,
    file: source.file,
    fileUrl: source.url || undefined,
  }

  const onSubmit = (event: FormEvent) => {
    event.preventDefault()
    mutation.mutate(payload)
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={onSubmit}>
      <FileOrUrlInput label="Sticker" accept="image/*" value={source} onChange={setSource} />
      <FormActions
        submitLabel="Send sticker"
        pending={mutation.isPending}
        disabled={!jid}
        request={stickerRequest(payload)}
      />
      <ResultPanel result={mutation.data} />
    </form>
  )
}
