export default function Root({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        {/*
          viewport-fit=cover: extends layout under notch/home bar so safe-area-inset-* env vars populate on iOS.
          maximum-scale=1: prevents pinch/double-tap zoom for a native app feel.
          interactive-widget=resizes-content: on Chrome/Android, shrink the visual viewport when the keyboard opens.
        */}
        <meta
          name="viewport"
          content="width=device-width, initial-scale=1, minimum-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover, interactive-widget=resizes-content"
        />
        {/* PWA / Add to Home Screen */}
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="vclub" />
        {/*
          Do not use expo-router's ScrollViewStyleReset here: it sets body { overflow: hidden },
          which prevents iOS Safari from collapsing the URL bar and bottom browser chrome when scrolling.

          Instead: keep body vertically scrollable with a 1px scroll range and pin #root with position:fixed
          so the micro-scroll still reaches the document (Safari requirement) without affecting app layout.
        */}
        {/* @ts-ignore */}
        <style
          id="expo-reset"
          dangerouslySetInnerHTML={{
            __html: `
          html {
            height: 100%;
          }
          body {
            height: 100%;
            margin: 0;
            padding: 0;
            background-color: #F9F9F9;
            overflow-y: scroll;
            -webkit-overflow-scrolling: touch;
            overscroll-behavior-y: contain;
          }
          body::after {
            content: '';
            display: block;
            height: 1px;
          }
          #root {
            position: fixed;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            display: flex;
            overflow: hidden;
          }
          #root > div {
            height: 100%;
            display: flex;
            flex-direction: column;
          }
          input, select, textarea { font-size: max(16px, 1em); }
          button, a, input, select, textarea, label { touch-action: manipulation; }
        `,
          }}
        />
      </head>
      <body>
        {/* @ts-ignore */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
(function () {
  function setVVH() {
    var h = (window.visualViewport ? window.visualViewport.height : window.innerHeight);
    document.documentElement.style.setProperty('--vvh', h + 'px');
  }
  setVVH();
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', setVVH);
    window.visualViewport.addEventListener('scroll', setVVH);
  } else {
    window.addEventListener('resize', setVVH);
  }
})();
`,
          }}
        />
        {children}
      </body>
    </html>
  )
}
