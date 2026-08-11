import { createContext, useContext, MutableRefObject } from "react";

/**
 * Values that change on every tab switch. Only the pager / tab bar should
 * subscribe — feed screens use `TabsShellContext` so they don't re-render
 * when `activeTabIndex` changes.
 */
type TabsActiveContextType = {
  activeTabIndex: number;
};

/**
 * Stable-ish shell values for tab screens (padding, blockers, refresh ticks).
 * `docScrollActive` still flips with the active tab on narrow web.
 */
type TabsShellContextType = {
  goToTab: (index: number) => void;
  eventsRefreshTick: number;
  pagerBlocked: MutableRefObject<boolean>;
  setTabBarHidden: (hidden: boolean) => void;
  tabBarHeight: number;
  docScrollActive: boolean;
};

export type TabsContextType = TabsActiveContextType & TabsShellContextType;

export const TabsActiveContext = createContext<TabsActiveContextType>({
  activeTabIndex: 0,
});

export const TabsShellContext = createContext<TabsShellContextType>({
  goToTab: () => {},
  eventsRefreshTick: 0,
  pagerBlocked: { current: false },
  setTabBarHidden: () => {},
  tabBarHeight: 0,
  docScrollActive: false,
});

/** Full tabs API (active index + shell). Prefer the split hooks in new code. */
export const TabsContext = createContext<TabsContextType>({
  goToTab: () => {},
  activeTabIndex: 0,
  eventsRefreshTick: 0,
  pagerBlocked: { current: false },
  setTabBarHidden: () => {},
  tabBarHeight: 0,
  docScrollActive: false,
});

export const useTabsActive = () => useContext(TabsActiveContext);
export const useTabsShell = () => useContext(TabsShellContext);

/** @deprecated Prefer `useTabsShell` / `useTabsActive` to avoid extra re-renders. */
export const useTabsContext = () => useContext(TabsContext);
