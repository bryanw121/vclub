import React, { useEffect, useMemo, useRef, useState } from 'react'
import { View, Text, TextInput, TouchableOpacity, Platform } from 'react-native'
import { supabase } from '../lib/supabase'
import { shared, theme } from '../constants'
import type { MajorCity } from '../types'

type Props = {
  label?: string
  value: MajorCity | null
  onChange: (city: MajorCity | null) => void
  error?: string
}

const MAX_SUGGESTIONS = 12

export function MajorCityAutocomplete({ label = 'Metro area', value, onChange, error }: Props) {
  const [catalog, setCatalog] = useState<MajorCity[]>([])
  const [inputText, setInputText] = useState(value?.display_name ?? '')
  const [open, setOpen] = useState(false)
  const [loadError, setLoadError] = useState<string | null>(null)
  const blurCloseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    let cancelled = false
    void (async () => {
      const { data, error: e } = await supabase
        .from('major_cities')
        .select('id, display_name, city_name, admin_region, country_code')
        .order('display_name', { ascending: true })
      if (cancelled) return
      if (e) {
        setLoadError(e.message)
        return
      }
      setCatalog((data ?? []) as unknown as MajorCity[])
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    setInputText(value?.display_name ?? '')
  }, [value?.id])

  const q = inputText.trim().toLowerCase()
  const suggestions = useMemo(() => {
    if (!q) return catalog.slice(0, MAX_SUGGESTIONS)
    return catalog
      .filter(c => {
        const dn = c.display_name.toLowerCase()
        const cn = c.city_name.toLowerCase()
        const ar = (c.admin_region ?? '').toLowerCase()
        return dn.includes(q) || cn.includes(q) || (ar.length > 0 && ar.includes(q))
      })
      .slice(0, MAX_SUGGESTIONS)
  }, [catalog, q])

  function clearBlurTimer() {
    if (blurCloseTimer.current) {
      clearTimeout(blurCloseTimer.current)
      blurCloseTimer.current = null
    }
  }

  function choose(city: MajorCity) {
    clearBlurTimer()
    onChange(city)
    setInputText(city.display_name)
    setOpen(false)
  }

  const showList = open && suggestions.length > 0

  return (
    <View style={shared.inputContainer}>
      {label ? <Text style={shared.label}>{label}</Text> : null}
      <TextInput
        value={inputText}
        onChangeText={t => {
          setInputText(t)
          setOpen(true)
          if (!value || t !== value.display_name) onChange(null)
        }}
        onFocus={() => {
          clearBlurTimer()
          setOpen(true)
        }}
        onBlur={() => {
          blurCloseTimer.current = setTimeout(() => setOpen(false), 220)
        }}
        placeholder="Search major cities…"
        placeholderTextColor={theme.colors.subtext}
        style={[
          shared.input,
          !!error && shared.inputError,
          Platform.OS === 'web' && { fontSize: 16 },
        ]}
        autoCorrect={false}
        autoCapitalize="none"
      />
      {showList && (
        <View
          style={{
            marginTop: 6,
            borderWidth: 1,
            borderColor: theme.colors.border,
            borderRadius: theme.radius.md,
            backgroundColor: theme.colors.card,
            overflow: 'hidden',
          }}
        >
          {suggestions.map(c => (
            <TouchableOpacity
              key={c.id}
              activeOpacity={0.7}
              onPressIn={clearBlurTimer}
              onPress={() => choose(c)}
              style={{
                paddingVertical: 12,
                paddingHorizontal: 14,
                borderBottomWidth: 1,
                borderBottomColor: theme.colors.border,
              }}
            >
              <Text style={{ fontFamily: theme.fonts.body, color: theme.colors.text }}>{c.display_name}</Text>
              {c.country_code !== 'US' ? (
                <Text style={{ fontSize: 11, color: theme.colors.subtext, marginTop: 2 }}>{c.country_code}</Text>
              ) : null}
            </TouchableOpacity>
          ))}
        </View>
      )}
      {error || loadError ? (
        <Text style={{ color: theme.colors.error, fontSize: 12, marginTop: 4 }}>{error || loadError}</Text>
      ) : null}
    </View>
  )
}
