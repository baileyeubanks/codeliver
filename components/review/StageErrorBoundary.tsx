"use client";

import { Component, type ReactNode } from "react";
import FailOnStageCard from "@/components/player/FailOnStageCard";

interface StageErrorBoundaryProps {
  children: ReactNode;
}

interface StageErrorBoundaryState {
  failed: boolean;
}

/**
 * VA-010: a render or media-pipeline failure inside the player tree must not
 * bubble to the full-page boundary. The stage shell stays mounted (deep navy
 * fill, rounded) and offers one quiet line plus a Retry that remounts the
 * same route's player subtree.
 */
export default class StageErrorBoundary extends Component<
  StageErrorBoundaryProps,
  StageErrorBoundaryState
> {
  override state: StageErrorBoundaryState = { failed: false };

  static getDerivedStateFromError(): StageErrorBoundaryState {
    return { failed: true };
  }

  override componentDidCatch(error: unknown) {
    console.error("Review stage recovered from a render failure", error);
  }

  private readonly reset = () => {
    this.setState({ failed: false });
  };

  override render() {
    if (this.state.failed) {
      return (
        <div className="review-stage-shell" data-stage-failed="true">
          <FailOnStageCard onRetry={this.reset} />
        </div>
      );
    }

    return this.props.children;
  }
}
