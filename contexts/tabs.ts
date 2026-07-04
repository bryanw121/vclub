import { createContext, useContext, MutableRefObject } from "react";

type TabsContextType = {
  // Call this to programmatically navigate to a tab by index (0=Events, 1=Clubs, 2=Profile)
  goToTab: (index: number) => void;
  // Pager-controlled tab index (mobile / narrow web); wide web uses router only
  activeTabIndex: number;
  // Bumps when the tabs shell regains focus so Events can refetch (e.g. after host/event)
  eventsRefreshTick: number;
  // Set to true while a horizontal FlatList is scrolling to prevent the Pager from stealing the gesture
  pagerBlocked: MutableRefObject<boolean>;
  // Hide or show the bottom tab bar (animated, web-mobile only)
  setTabBarHidden: (hidden: boolean) => void;
  // Current measured height of the tab bar (0 on wide web where there is no tab bar)
  tabBarHeight: number;
  // True when mobile web is in document-scroll mode (body scrolls so browser bars collapse)
  docScrollActive: boolean;
};

export const TabsContext = createContext<TabsContextType>({
  goToTab: () => {},
  activeTabIndex: 0,
  eventsRefreshTick: 0,
  pagerBlocked: { current: false },
  setTabBarHidden: () => {},
  tabBarHeight: 0,
  docScrollActive: false,
});
export const useTabsContext = () => useContext(TabsContext);
