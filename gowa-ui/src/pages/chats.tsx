import { useRef, useState } from 'react'
import { MessagesSquare } from 'lucide-react'
import { ChatList } from '@/features/chat/chat-list'
import { MessageView } from '@/features/chat/message-view'
import { DeviceGuard, useSelectedDevice } from '@/hooks/use-device-guard'
import type { ChatInfo } from '@/api/chat'
import { GlowCard } from '@/components/ui/glow-card'

export default function ChatsPage() {
  const device = useSelectedDevice()
  const [selected, setSelected] = useState<ChatInfo | null>(null)
  const messagePane = useRef<HTMLDivElement>(null)

  const handleSelect = (chat: ChatInfo) => {
    setSelected(chat)
    messagePane.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }

  if (!device) {
    return (
      <div className="flex flex-col gap-4">
        <DeviceGuard />
      </div>
    )
  }

  return (
    <div className="h-[calc(100vh-6.5rem)] min-h-[500px] w-full flex flex-col">
      <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] h-full w-full gap-4 min-h-0">
        {/* Left Sidebar: Scrollable Chat List */}
        <GlowCard
          glowColor="rgba(59,130,246,0.15)"
          className="h-full min-h-0 flex flex-col p-4 border border-border/80 shadow-sm rounded-2xl bg-card overflow-hidden"
        >
          <ChatList selectedJid={selected?.jid ?? null} onSelect={handleSelect} />
        </GlowCard>

        {/* Right Panel: Scrollable Message Thread */}
        <GlowCard
          glowColor="rgba(99,102,241,0.15)"
          className="h-full min-h-0 flex flex-col p-4 border border-border/80 shadow-sm rounded-2xl bg-card overflow-hidden"
        >
          <div ref={messagePane} className="h-full min-h-0 flex flex-col">
            {selected ? (
              <MessageView chat={selected} />
            ) : (
              <div className="text-muted-foreground flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
                <div className="size-16 rounded-2xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center">
                  <MessagesSquare className="size-8 opacity-80" />
                </div>
                <h3 className="text-base font-bold text-foreground">Percakapan WhatsApp</h3>
                <p className="text-xs text-muted-foreground max-w-sm">
                  Pilih salah satu obrolan dari daftar sebelah kiri untuk melihat riwayat pesan dan mengirim balasan secara langsung.
                </p>
              </div>
            )}
          </div>
        </GlowCard>
      </div>
    </div>
  )
}
