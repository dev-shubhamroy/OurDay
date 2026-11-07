import { Monitor, Moon, RotateCcw, Sun, User as UserIcon, Users } from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { Avatar } from '../components/ui/Avatar'
import { Button } from '../components/ui/Button'
import { Segmented } from '../components/ui/Controls'
import { PageHeader } from '../components/ui/PageHeader'
import { useApp } from '../hooks/useApp'
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
  const { me, partner } = useApp()
  const navigate = useNavigate()

  return (
    <>
      <PageHeader eyebrow="Preferences" title="Settings" subtitle="Theme works now. Account features arrive with the backend phase." />
      <div className="grid max-w-3xl gap-5">
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
            <div>
              <p className="font-medium">{me.name}</p>
              <p className="text-sm text-muted">Signed in as a demo user · sign-in comes with Supabase</p>
            </div>
          </div>
        </Group>

        <Group icon={<Users className="h-4 w-4" />} title="Your partner">
          <div className="flex items-center gap-3">
            <Avatar user={partner} />
            <div>
              <p className="font-medium">{partner.name}</p>
              <p className="text-sm text-muted">Full access to all tasks. Notifications are controlled per task.</p>
            </div>
          </div>
        </Group>

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

        <p className="px-1 text-xs text-muted">OurDay · Phase 1 preview · all data on screen is sample data.</p>
      </div>
    </>
  )
}
