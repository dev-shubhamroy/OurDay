import { PageHeader } from '../components/ui/PageHeader'

export default function Placeholder({ title }: { title: string }) {
  return (
    <>
      <PageHeader title={title} subtitle="This screen is being built in an upcoming milestone." />
      <div className="panel grid h-48 place-items-center text-muted">Coming up next</div>
    </>
  )
}
