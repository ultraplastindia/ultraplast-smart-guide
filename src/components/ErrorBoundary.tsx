import { Component, type ErrorInfo, type ReactNode } from 'react'

interface State { error: Error | null }

/** Shows a readable message instead of a blank white page if something crashes. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null }
  static getDerivedStateFromError(error: Error): State { return { error } }
  componentDidCatch(error: Error, info: ErrorInfo) { console.error(error, info.componentStack) }
  render() {
    if (!this.state.error) return this.props.children
    return (
      <div className="min-h-screen grid place-items-center p-4">
        <div className="max-w-lg bg-white border border-steel-300 p-6 space-y-3">
          <h1 className="text-xl font-bold">Something went wrong</h1>
          <p className="text-sm">Reload the page. If it happens again, send this message to your administrator:</p>
          <pre className="text-xs bg-steel-100 p-2 overflow-auto">{this.state.error.message}</pre>
          <button className="bg-belt-700 text-white px-4 py-2" onClick={() => window.location.reload()}>Reload</button>
        </div>
      </div>
    )
  }
}
