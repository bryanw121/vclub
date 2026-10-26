// Native: React Native's own RefreshControl already works. The web build picks
// RefreshControl.web.tsx instead (#35). Import RefreshControl from here, never
// from 'react-native' (a guard test enforces it).
export { RefreshControl } from 'react-native'
