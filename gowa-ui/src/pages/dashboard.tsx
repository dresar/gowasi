import { useState } from 'react'
import { Smartphone, CheckCircle2, AlertTriangle, Radio } from 'lucide-react'
import { EmptyState } from '@/components/shared/empty-state'
import { Card, CardContent } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { GlowCard } from '@/components/ui/glow-card'
import { AnimatedList } from '@/components/ui/animated-list'
import { CreateDeviceDialog } from '@/features/devices/create-device-dialog'
import { DeviceCard } from '@/features/devices/device-card'
import { LoginCodeDialog } from '@/features/session/login-code-dialog'
import { LoginQrDialog } from '@/features/session/login-qr-dialog'
import { useDevices } from '@/hooks/use-devices'
import { toApiError } from '@/lib/api-error'
import type { RegistryDevice } from '@/api/types'

export default function DashboardPage() {
  const { data: devices, isLoading, error } = useDevices()
  const [qrDevice, setQrDevice] = useState<RegistryDevice | null>(null)
  const [codeDevice, setCodeDevice] = useState<RegistryDevice | null>(null)

  const connectedCount = devices?.filter((d) => d.state === 'connected' || d.state === 'logged_in').length ?? 0
  const disconnectedCount = (devices?.length ?? 0) - connectedCount

  return (
    <div className="flex flex-col gap-6">
      {/* KPI Cards (Directly below top header) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6">
        <GlowCard glowColor="rgba(99,102,241,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-indigo-500/10 text-indigo-500 flex items-center justify-center shrink-0">
              <Smartphone className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight">{devices?.length ?? 0}</p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Total Slot Device</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(16,185,129,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-emerald-500/10 text-emerald-500 flex items-center justify-center shrink-0">
              <CheckCircle2 className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-emerald-600 dark:text-emerald-400">
                {connectedCount}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Koneksi Aktif</p>
            </div>
          </CardContent>
        </GlowCard>

        <GlowCard glowColor="rgba(245,158,11,0.25)">
          <CardContent className="p-5 flex items-center gap-4">
            <div className="size-12 rounded-xl bg-amber-500/10 text-amber-500 flex items-center justify-center shrink-0">
              <Radio className="size-6" />
            </div>
            <div>
              <p className="text-3xl font-extrabold font-mono tracking-tight text-amber-600 dark:text-amber-400">
                {disconnectedCount}
              </p>
              <p className="text-muted-foreground text-xs font-medium mt-0.5">Terputus / Unpaired</p>
            </div>
          </CardContent>
        </GlowCard>
      </div>

      {/* Control Bar: Section Title + Add Device Action */}
      <div className="flex items-center justify-between gap-4 bg-card p-4 rounded-2xl border border-border/80 shadow-xs">
        <div>
          <h2 className="text-base font-bold text-foreground">
            Daftar Device WhatsApp ({devices?.length ?? 0})
          </h2>
          <p className="text-xs text-muted-foreground">
            Kelola koneksi sesi WhatsApp Web dan status pairing.
          </p>
        </div>
        <div className="shrink-0">
          <CreateDeviceDialog />
        </div>
      </div>

      {/* Error alert */}
      {error && (
        <Card className="border-destructive/50 bg-destructive/5 rounded-2xl">
          <CardContent className="text-destructive py-4 text-sm flex items-center gap-2">
            <AlertTriangle className="size-4 shrink-0" />
            <span>Gagal memuat daftar device: {toApiError(error).message}</span>
          </CardContent>
        </Card>
      )}

      {/* Loading Skeletons */}
      {isLoading && (
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <Skeleton className="h-56 rounded-2xl" />
          <Skeleton className="h-56 rounded-2xl" />
        </div>
      )}

      {/* Empty State */}
      {devices && devices.length === 0 && (
        <EmptyState
          icon={Smartphone}
          title="Belum ada device WhatsApp"
          hint="Klik tombol '+ Add device' di atas untuk menambah slot device baru, lalu pairing via Scan QR atau Kode Pair."
        />
      )}

      {/* Device Cards Grid */}
      {devices && devices.length > 0 && (
        <AnimatedList className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onLoginQr={setQrDevice}
              onLoginCode={setCodeDevice}
            />
          ))}
        </AnimatedList>
      )}

      <LoginQrDialog device={qrDevice} onOpenChange={(open) => !open && setQrDevice(null)} />
      <LoginCodeDialog device={codeDevice} onOpenChange={(open) => !open && setCodeDevice(null)} />
    </div>
  )
}
