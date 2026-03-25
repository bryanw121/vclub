import { createContext, useContext } from "react";

type TabsContextType = {
  // Call this to programmatically navigate to a tab by index (0=Events, 1=Host, 2=Profile)
  goToTab: (index: number) => void;
};

export const TabsContext = createContext<TabsContextType>({
  goToTab: () => {},
});
export const useTabsContext = () => useContext(TabsContext);
