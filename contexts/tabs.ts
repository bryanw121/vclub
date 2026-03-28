import { createContext, useContext, MutableRefObject } from "react";

type TabsContextType = {
  // Call this to programmatically navigate to a tab by index (0=Events, 1=Profile)
  goToTab: (index: number) => void;
  // Set to true while a horizontal FlatList is scrolling to prevent the Pager from stealing the gesture
  pagerBlocked: MutableRefObject<boolean>;
  // Hide or show the bottom tab bar (animated, web-mobile only)
  setTabBarHidden: (hidden: boolean) => void;
};

export const TabsContext = createContext<TabsContextType>({
  goToTab: () => {},
  pagerBlocked: { current: false },
  setTabBarHidden: () => {},
});
export const useTabsContext = () => useContext(TabsContext);
