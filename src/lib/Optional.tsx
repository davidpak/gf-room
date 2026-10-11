import { Component, type ReactNode } from 'react'

/**
 * A part that may not be there: a file kept local and never shipped (the Civic's model, licence unchecked). If it
 * fails to load, its fallback stands in, instead of the whole page going down.
 */
export class Optional extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  componentDidCatch(e: unknown) {
    console.warn('a part is missing, its stand-in shown', e)
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children
  }
}
