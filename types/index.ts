export type Profile = {
  id: string
  username: string
  avatar_url: string | null
  created_at: string
}

export type Event = {
  id: string
  created_by: string
  title: string
  description: string | null
  location: string | null
  event_date: string
  max_attendees: number | null
  created_at: string
}

export type EventAttendee = {
  event_id: string
  user_id: string
  joined_at: string
}

export type EventWithDetails = Event & {
  profiles: Profile
  event_attendees: EventAttendee[]
}
