import { createContext, useContext, MutableRefObject } from "react";

type TabsContextType = {
  // Call this to programmatically navigate to a tab by index (0=Events, 1=Host, 2=Profile)
  goToTab: (index: number) => void;
  // Set to true while a horizontal FlatList is scrolling to prevent the Pager from stealing the gesture
  pagerBlocked: MutableRefObject<boolean>;
};

export const TabsContext = createContext<TabsContextType>({
  goToTab: () => {},
  pagerBlocked: { current: false },
});
export const useTabsContext = () => useContext(TabsContext);
