import { useState } from 'react'
import { keepPreviousData, useQuery } from '@tanstack/react-query'
import { Loader2, Search } from 'lucide-react'
import { listChats, type ChatInfo } from '@/api/chat'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { formatDate, isZeroTime } from '@/lib/format'
import { cn } from '@/lib/utils'

const PAGE_SIZE = 25

export function ChatList({
  selectedJid,
  onSelect,
}: {
  selectedJid: string | null
  onSelect: (chat: ChatInfo) => void
}) {
  const [search, setSearch] = useState('')
  const [hasMedia, setHasMedia] = useState(false)
  const [offset, setOffset] = useState(0)

  const query = useQuery({
    queryKey: ['chats', { search, hasMedia, offset }],
    queryFn: () =>
      listChats({
        search: search || undefined,
        has_media: hasMedia || undefined,
        limit: PAGE_SIZE,
        offset,
      }),
    placeholderData: keepPreviousData,
  })

  const chats = query.data?.data ?? []
  const total = query.data?.pagination.total ?? 0

  return (
    <div className="flex h-full min-h-0 flex-col gap-3">
      <div className="flex flex-col gap-2 shrink-0">
        <div className="relative">
          <Search className="text-muted-foreground absolute top-3 left-3 size-4" />
          <Input
            className="pl-9 rounded-xl h-10 text-sm border-border/80 bg-muted/20"
            placeholder="Cari obrolan / nomor..."
            value={search}
            onChange={(event) => {
              setSearch(event.target.value)
              setOffset(0)
            }}
          />
        </div>
        <div className="flex items-center justify-between px-1">
          <label className="text-muted-foreground flex items-center gap-2 text-xs cursor-pointer">
            <Switch
              checked={hasMedia}
              onCheckedChange={(value) => {
                setHasMedia(value)
                setOffset(0)
              }}
            />
            Hanya dengan media
          </label>
        </div>
      </div>

      <div className="min-h-0 flex-1 rounded-xl border border-border/40 bg-muted/10 p-1.5 overflow-y-auto custom-scrollbar">
        {query.isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="text-primary size-6 animate-spin" />
          </div>
        ) : chats.length === 0 ? (
          <p className="text-muted-foreground p-8 text-center text-xs italic">Tidak ada percakapan ditemukan</p>
        ) : (
          <div className="flex flex-col gap-1">
            {chats.map((chat) => (
              <button
                key={chat.jid}
                type="button"
                onClick={() => onSelect(chat)}
                className={cn(
                  'flex w-full items-center gap-3 p-2.5 rounded-xl text-left transition-all',
                  selectedJid === chat.jid
                    ? 'bg-primary/10 border border-primary/30 text-foreground font-semibold'
                    : 'hover:bg-muted/40 border border-transparent',
                )}
              >
                <div className="size-10 rounded-full bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center font-bold text-sm shrink-0 shadow-xs">
                  {(chat.name || chat.jid).slice(0, 1).toUpperCase()}
                </div>
                <div className="flex min-w-0 flex-1 flex-col">
                  <div className="flex items-center justify-between gap-1">
                    <span className="truncate text-xs font-bold text-foreground">
                      {chat.name || chat.jid}
                    </span>
                    <span className="text-[10px] text-muted-foreground shrink-0 font-mono">
                      {isZeroTime(chat.last_message_time)
                        ? ''
                        : formatDate(chat.last_message_time)}
                    </span>
                  </div>
                  <span className="text-muted-foreground truncate font-mono text-[11px] mt-0.5">
                    {chat.jid}
                  </span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="text-muted-foreground flex items-center justify-between text-xs">
        <span>{total} chats</span>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={offset === 0}
            onClick={() => setOffset(Math.max(0, offset - PAGE_SIZE))}
          >
            Prev
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={offset + PAGE_SIZE >= total}
            onClick={() => setOffset(offset + PAGE_SIZE)}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
