export { theme } from './theme'
export { shared } from './styles'

export function formatEventDate(dateString: string, style: 'short' | 'long' = 'short') {
  const date = new Date(dateString)

  if (style === 'long') {
    return date.toLocaleString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
    })
  }

  return date.toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  })
}
