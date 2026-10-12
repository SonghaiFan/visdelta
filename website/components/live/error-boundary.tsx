'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  name: string;
}

/** Contains render errors from a live example so the page around it survives. */
export class ExampleErrorBoundary extends Component<Props, { error: Error | null }> {
  state = { error: null as Error | null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error(`Live example "${this.props.name}" failed`, error, info.componentStack);
  }

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div role="alert" data-example-error="" className="not-prose my-6 rounded-lg border p-4 text-sm">
        <strong className="font-medium">The live example “{this.props.name}” failed to render.</strong>
        <code className="mt-1 block text-xs text-fd-muted-foreground">{this.state.error.message}</code>
      </div>
    );
  }
}
