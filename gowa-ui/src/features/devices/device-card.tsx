import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import {
  KeyRound,
  MoreVertical,
  QrCode,
  RefreshCw,
  Trash2,
  Unplug,
  Webhook,
  Smartphone,
} from 'lucide-react'
import { toast } from 'sonner'
import { logoutDevice, reconnectDevice, removeDevice } from '@/api/devices'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { GlowCard } from '@/components/ui/glow-card'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { StateBadge } from '@/features/devices/state-badge'
import { DeviceWebhookDialog } from '@/features/devices/webhook-dialog'
import { useDeviceAvatar } from '@/hooks/use-device-avatar'
import { toApiError } from '@/lib/api-error'
import { formatDate } from '@/lib/format'
import { cn } from '@/lib/utils'
import { useDeviceStore } from '@/stores/device'
import type { RegistryDevice } from '@/api/types'

export function DeviceCard({
  device,
  onLoginQr,
  onLoginCode,
}: {
  device: RegistryDevice
  onLoginQr: (device: RegistryDevice) => void
  onLoginCode: (device: RegistryDevice) => void
}) {
  const queryClient = useQueryClient()
  const selectedDeviceId = useDeviceStore((state) => state.selectedDeviceId)
  const selectDevice = useDeviceStore((state) => state.selectDevice)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [webhookOpen, setWebhookOpen] = useState(false)
  const selected = selectedDeviceId === device.id
  const avatar = useDeviceAvatar(device)

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ['devices'] })

  const logout = useMutation({
    mutationFn: () => logoutDevice(device.id),
    onSuccess: () => {
      toast.success(`Logout requested for ${device.id}`)
      void invalidate()
    },
    onError: (error) => toast.error(toApiError(error).message),
  })

  const reconnect = useMutation({
    mutationFn: () => reconnectDevice(device.id),
    onSuccess: () => {
      toast.success(`Reconnect requested for ${device.id}`)
      void invalidate()
    },
    onError: (error) => toast.error(toApiError(error).message),
  })

  const remove = useMutation({
    mutationFn: () => removeDevice(device.id),
    onSuccess: () => {
      toast.success(`Device ${device.id} removed`)
      if (selected) selectDevice(null)
      void invalidate()
    },
    onError: (error) => toast.error(toApiError(error).message),
  })

  const isConnected = device.state === 'connected' || device.state === 'logged_in'

  return (
    <GlowCard
      glowColor={isConnected ? 'rgba(16,185,129,0.25)' : 'rgba(239,68,68,0.2)'}
      borderColor={selected ? 'rgba(99,102,241,0.6)' : undefined}
      className={cn(
        'flex flex-col justify-between transition-all duration-300',
        selected && 'ring-2 ring-primary shadow-lg',
      )}
    >
      <div>
        <CardHeader className="flex flex-row items-start justify-between gap-3 space-y-0 p-5 pb-3">
          <div className="flex min-w-0 items-center gap-3">
            <Avatar className="size-11 border shadow-xs">
              {avatar.data?.url && (
                <AvatarImage src={avatar.data.url} alt={device.display_name || device.id} />
              )}
              <AvatarFallback className="bg-primary/10 text-primary font-bold">
                {device.display_name ? (
                  device.display_name.charAt(0).toUpperCase()
                ) : (
                  <Smartphone className="size-5" />
                )}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <p className="truncate font-semibold text-base">{device.display_name || device.id}</p>
                {selected && (
                  <span className="bg-primary text-primary-foreground text-[10px] font-bold px-1.5 py-0.5 rounded-full uppercase">
                    Active
                  </span>
                )}
              </div>
              <p className="text-muted-foreground truncate text-xs font-mono mt-0.5">
                {device.phone_number || device.jid || 'Belum terhubung'}
              </p>
            </div>
          </div>
          <StateBadge state={device.state} />
        </CardHeader>

        <CardContent className="text-muted-foreground text-xs px-5 py-2 flex flex-col gap-1">
          <div className="flex justify-between items-center py-1 border-t border-b border-border/40">
            <span>Device ID:</span>
            <span className="font-mono font-medium text-foreground">{device.id}</span>
          </div>
          <p className="pt-1 text-[11px]">Dibuat: {formatDate(device.created_at)}</p>
        </CardContent>
      </div>

      <CardFooter className="flex items-center justify-between gap-2 p-5 pt-3 bg-muted/20">
        <Button
          variant={selected ? 'default' : 'outline'}
          size="sm"
          onClick={() => selectDevice(device.id)}
          disabled={selected}
          className="rounded-full text-xs font-medium"
        >
          {selected ? 'Sedang Digunakan' : 'Pilih Device Ini'}
        </Button>
        <div className="flex items-center gap-1">
          {device.state !== 'logged_in' && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => onLoginQr(device)}
              className="gap-1 rounded-full text-xs font-semibold"
            >
              <QrCode className="size-3.5 text-primary" />
              Pairing
            </Button>
          )}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="size-8 rounded-full" aria-label="Device actions">
                <MoreVertical className="size-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem onClick={() => onLoginQr(device)}>
                <QrCode className="size-4 mr-2" /> Login dengan QR
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => onLoginCode(device)}>
                <KeyRound className="size-4 mr-2" /> Login dengan Kode
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => reconnect.mutate()}>
                <RefreshCw className="size-4 mr-2" /> Reconnect Sesi
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => logout.mutate()}>
                <Unplug className="size-4 mr-2" /> Logout Device
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => setWebhookOpen(true)}>
                <Webhook className="size-4 mr-2" /> Setting Webhook
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem variant="destructive" onClick={() => setConfirmDelete(true)}>
                <Trash2 className="size-4 mr-2" /> Hapus Device
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </CardFooter>

      <DeviceWebhookDialog device={device} open={webhookOpen} onOpenChange={setWebhookOpen} />

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Hapus device {device.id}?</AlertDialogTitle>
            <AlertDialogDescription>
              Tindakan ini akan menghapus slot device dan sesi WhatsApp terkait dari server.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Batal</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate()}
              className="bg-destructive hover:bg-destructive/90 text-white"
            >
              Hapus Sekarang
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </GlowCard>
  )
}
