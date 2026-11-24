import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import 'virtual:theme.css'
import App from './App.tsx'
import { useTheme, applyThemeAttrs } from './store/theme'
import { useTextSize, applyTextSize } from './store/text-size'
import { adoptLinkScenario } from './hooks/useShareLink'

// Reconcile the static <html data-theme/data-color> shipped in index.html with
// the URL/localStorage-derived initial theme, before first render.
applyThemeAttrs(useTheme.getState().theme, useTheme.getState().color)
// The saved text size goes on the root before the first render, so the first measure of the
// bottom stack is at the right scale.
applyTextSize(useTextSize.getState().size)
// A share link names its scenario: make it this browser's choice before any data is read.
adoptLinkScenario()

async function boot(): Promise<void> {
  const root = document.getElementById('root')!
  // The env test is written inline (not through lib/build-flags) so Vite replaces it at
  // build time and drops this branch, and the adapter chunk, from the live app.
  if (import.meta.env.VITE_STATIC === '1') {
    // No backend in a static build: answer /api/* from the exported files.
    try {
      const { installStaticApi } = await import('./lib/static-api')
      await installStaticApi({ base: import.meta.env.BASE_URL })
    } catch (err) {
      // Say what failed. A blank page would hide a missing export.
      root.textContent = `This build could not load its data: ${err instanceof Error ? err.message : String(err)}`
      return
    }
  }
  createRoot(root).render(
    <StrictMode>
      <App />
    </StrictMode>,
  )
}

void boot()
