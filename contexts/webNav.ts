import { createContext, useContext } from 'react'

type WebNavContextType = {
  activeTab: number
  goToTab: (index: number) => void
}

export const WebNavContext = createContext<WebNavContextType>({
  activeTab: 0,
  goToTab: () => {},
})

export const useWebNav = () => useContext(WebNavContext)
