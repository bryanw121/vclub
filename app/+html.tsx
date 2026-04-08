import { ScrollViewStyleReset } from 'expo-router/html'

export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/*
          viewport-fit=cover: extends layout under notch/home bar so safe-area-inset-* env vars populate on iOS.
          maximum-scale=1: prevents pinch/double-tap zoom for a native app feel.
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover"
        />
        <ScrollViewStyleReset />
        {/* @ts-ignore */}
        <style dangerouslySetInnerHTML={{ __html: `
          /*
            Prevent iOS Safari from zooming in when an input/select is focused.
            iOS zooms if font-size < 16px; max() ensures it's always at least 16px.
          */
          input, select, textarea { font-size: max(16px, 1em); }

          /*
            Prevent Chrome/Android's native pull-to-refresh gesture from
            interfering with the app's own scroll views.
          */
          body { overscroll-behavior-y: contain; }

          /*
            Suppress double-tap-to-zoom on interactive elements.
            RN Web handles Touchable* automatically, but HTML elements (e.g.
            in DatePickerField.web) need this explicitly.
          */
          button, a, input, select, textarea, label { touch-action: manipulation; }
        ` }} />
      </head>
      <body>{children}</body>
    </html>
  )
}
