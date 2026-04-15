export function formatShortTime(iso: string): string {
  try {
    const d = new Date(/[Z+]/.test(iso) ? iso : iso + 'Z')
    if (isNaN(d.getTime())) return ''
    return d.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  } catch {
    return ''
  }
}
