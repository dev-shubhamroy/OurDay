import { Bell, LogOut, Monitor, Moon, RotateCcw, Sun, User as UserIcon, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Controls'
import { PageHeader } from '../components/ui/PageHeader'
import { InvitePartner } from '../components/workspace/InvitePartner'
import { NotificationSettings } from '../components/notifications/NotificationSettings'
import { useNotifications } from '../hooks/useNotifications'
import { useApp } from '../hooks/useApp'
import { useAuth } from '../hooks/useAuth'
import { useWorkspace } from '../hooks/useWorkspace'
import { useTheme } from '../hooks/useTheme'
import { resetBriefingSeen } from '../services/briefingSeen'
import type { ReactNode } from 'react'

function Group({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <section className="panel animate-rise p-5 sm:p-6">
      <h2 className="mb-4 flex items-center gap-2.5 text-base font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-accent/10 text-accent">{icon}</span>
        {title}
      </h2>
      {children}
    </section>
  )
}

export default function Settings() {
  const { preference, setPreference } = useTheme()
  const { me, partner, sync } = useApp()
  const { user, signOut } = useAuth()
  const ws = useWorkspace()
  const navigate = useNavigate()
  const notif = useNotifications()

  return (
    <>
      <PageHeader eyebrow="Preferences" title="Settings" subtitle="Appearance, your account and your shared workspace." />
      <div className="grid max-w-3xl grid-cols-[minmax(0,1fr)] gap-5">
        <Group icon={<Sun className="h-4 w-4" />} title="Appearance">
          <Segmented
            label="Theme"
            value={preference}
            onChange={setPreference}
            options={[
              { value: 'dark', label: 'Dark', icon: <Moon className="h-4 w-4" /> },
              { value: 'light', label: 'Light', icon: <Sun className="h-4 w-4" /> },
              { value: 'system', label: 'System', icon: <Monitor className="h-4 w-4" /> },
            ]}
          />
        </Group>

        <Group icon={<UserIcon className="h-4 w-4" />} title="Account">
          <div className="flex items-center gap-3">
            <Avatar user={me} />
            <div className="min-w-0 flex-1">
              <p className="font-medium">{me.name}</p>
              <p className="truncate text-sm text-muted">{sync.remote ? (user?.email ?? '') : 'Local demo mode · sample data, nothing is saved'}</p>
            </div>
            {sync.remote && (
              <Button variant="ghost" size="sm" icon={<LogOut className="h-4 w-4" />} onClick={() => void signOut()}>
                Sign out
              </Button>
            )}
          </div>
        </Group>

        <Group icon={<Users className="h-4 w-4" />} title={sync.remote && ws.workspace ? ws.workspace.name : 'Your partner'}>
          <div className="flex items-center gap-3">
            <Avatar user={partner} />
            <div>
              <p className="font-medium">{partner.id === 'pending-partner' ? 'Waiting for your partner' : partner.name}</p>
              <p className="text-sm text-muted">{partner.id === 'pending-partner' ? 'Invite them below to share tasks, deadlines and habits.' : 'Full access to all tasks. Notifications are controlled per task.'}</p>
            </div>
          </div>
          {sync.remote && (
            <div className="mt-4">
              <InvitePartner />
            </div>
          )}
        </Group>

        {notif && !notif.unavailable && (
          <Group icon={<Bell className="h-4 w-4" />} title="Notifications">
            <NotificationSettings />
          </Group>
        )}

        <Group icon={<RotateCcw className="h-4 w-4" />} title="RANA">
          <p className="mb-3 text-sm text-muted">RANA greets you with a briefing on your first visit each day. Replay it any time.</p>
          <Button
            variant="soft"
            icon={<RotateCcw className="h-4 w-4" />}
            onClick={() => {
              resetBriefingSeen()
              navigate('/briefing')
            }}
          >
            Replay today’s briefing
          </Button>
        </Group>

        <p className="px-1 text-xs text-muted">OurDay</p>
      </div>
    </>
  )
}
