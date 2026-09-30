// Placeholder until the dashboard task: the site's name and the snippet.
import { useParams } from 'react-router'
import { api, useApi } from '../api'
import Snippet from '../components/Snippet'

export default function Site() {
  const { id = '' } = useParams()
  const sites = useApi(() => api.sites(), [])
  const site = sites.data?.find((s) => s.id === id)
  return (
    <div>
      <h1 className="font-display text-5xl">{site?.name}</h1>
      <div className="mt-6"><Snippet /></div>
    </div>
  )
}
