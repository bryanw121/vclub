import React from 'react'
import { ScrollView, Text, View } from 'react-native'
import { useStackBackTitle } from '../../../../hooks/useStackBackTitle'
import { shared } from '../../../../constants'

export default function ProfileKudosScreen() {
  useStackBackTitle('Kudos')
  return (
    <View style={shared.screen}>
      <ScrollView contentContainerStyle={shared.scrollContentSubpage}>
        <View style={shared.card}>
          <Text style={shared.caption}>Coming soon.</Text>
        </View>
      </ScrollView>
    </View>
  )
}
