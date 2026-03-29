import React, { useState } from 'react'
import { Alert, Modal, ScrollView, Text, TouchableOpacity, View } from 'react-native'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { supabase } from '../../../../lib/supabase'
import { Button } from '../../../../components/Button'
import { Input } from '../../../../components/Input'
import { shared } from '../../../../constants'
import type { FeedbackKind, FeedbackPriority } from '../../../../types'

export default function FeedbackScreen() {
  useStackBackTitle('Submit feedback')
  const [kind, setKind] = useState<FeedbackKind>('feature')
  const [priority, setPriority] = useState<FeedbackPriority>('medium')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [loading, setLoading] = useState(false)
  const [feedbackSubmitted, setFeedbackSubmitted] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

  async function submit() {
    try {
      if (!title.trim()) return Alert.alert('Missing info', 'Please add a short title.')
      if (!description.trim()) return Alert.alert('Missing info', 'Please add a description.')

      setLoading(true)
      setFeedbackError(null)
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) throw new Error('Not logged in')

      const { error } = await supabase.from('feedback_submissions').insert({
        user_id: user.id,
        kind,
        priority,
        title: title.trim(),
        description: description.trim(),
      })
      if (error) throw error

      setKind('feature')
      setPriority('medium')
      setTitle('')
      setDescription('')
      setFeedbackSubmitted(true)
    } catch (e: any) {
      setFeedbackError(e.message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <View style={shared.screen}>
      <Modal visible={feedbackSubmitted} transparent animationType="none" onRequestClose={() => setFeedbackSubmitted(false)}>
        <TouchableOpacity style={shared.modalOverlay} onPress={() => setFeedbackSubmitted(false)}>
          <View style={shared.modalCard}>
            <Text style={shared.modalEmoji}>🏐</Text>
            <Text style={shared.modalTitle}>Thanks for making vclub better!</Text>
            <Text style={shared.modalBody}>Your feedback has been saved and the team will review it.</Text>
            <TouchableOpacity style={shared.modalButton} onPress={() => setFeedbackSubmitted(false)}>
              <Text style={shared.modalButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      <ScrollView contentContainerStyle={shared.scrollContentSubpage}>
        <View style={shared.card}>
          <Text style={shared.label}>Type</Text>
          <ChoiceRow<FeedbackKind>
            value={kind}
            onChange={setKind}
            options={[
              { value: 'feature', label: 'Feature' },
              { value: 'bug', label: 'Bug' },
            ]}
          />

          <View style={shared.mt_md} />

          <Text style={shared.label}>Priority</Text>
          <ChoiceRow<FeedbackPriority>
            value={priority}
            onChange={setPriority}
            options={[
              { value: 'low', label: 'Low' },
              { value: 'medium', label: 'Medium' },
              { value: 'high', label: 'High' },
            ]}
          />

          <View style={shared.mt_md} />

          <Input
            label="Title"
            value={title}
            onChangeText={setTitle}
            placeholder="Short summary"
          />

          <Input
            label="Description"
            value={description}
            onChangeText={setDescription}
            placeholder="What should happen? What happened? Steps to reproduce?"
            multiline
            numberOfLines={6}
          />

          <View style={shared.mt_md} />

          <Button label="Submit" onPress={submit} loading={loading} disabled={loading} />

          {feedbackError ? (
            <Text style={[shared.mt_sm, shared.errorText]}>{feedbackError}</Text>
          ) : null}

          <View style={shared.mt_sm} />
          <Text style={shared.caption}>
            Your submission is saved to the club database so the team can triage it.
          </Text>
        </View>
      </ScrollView>
    </View>
  )
}

function ChoiceRow<T extends string>({
  value,
  onChange,
  options,
}: {
  value: T
  onChange: (v: T) => void
  options: { value: T; label: string }[]
}) {
  return (
    <View style={{ flexDirection: 'row', gap: 8 }}>
      {options.map(opt => {
        const active = opt.value === value
        return (
          <Button
            key={opt.value}
            label={opt.label}
            onPress={() => onChange(opt.value)}
            variant={active ? 'primary' : 'secondary'}
          />
        )
      })}
    </View>
  )
}
