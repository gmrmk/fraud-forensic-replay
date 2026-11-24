import { Component, createRef, type ComponentProps, type ReactNode } from "react";
import type maplibregl from "maplibre-gl";
import { GlobeMap } from "./GlobeMap";
import { Eyebrow, FocusButton, Panel } from "./ui";

/** How many times one page load rebuilds the map before it stops and offers a reload. */
export const MAX_RECOVERIES = 3;

interface MapRecoveryProps {
  /** Renders the map. What it returns is mounted fresh for each `generation`, which counts
   *  the maps given up before this one. */
  children: (generation: number) => ReactNode;
  /** The map is being given up: drop every reference to it. */
  onMapLost: () => void;
}

interface MapRecoveryState {
  generation: number;
  recoveries: number;
  stopped: boolean;
}

/**
 * MapRecovery - a map failure rebuilds the map; it does not blank the app.
 *
 * Each mounted map sits in a MapGeneration, which reports that map dead in two cases. An error
 * thrown while the map's tree renders or runs its effects is caught there (with no boundary,
 * React unmounts the whole app). A lost WebGL context is heard on its host in the capture
 * phase, since the event does not bubble: MapLibre drops its style on that event, and
 * `getLayer` and `getSource` throw on the next write.
 *
 * Either way the map's subtree mounts again under a new key: a new canvas and a new context,
 * while the stores (playhead, selection, layers) stand. The camera does not survive: the new
 * map starts from the view the page opened with. After MAX_RECOVERIES the map gives way to a
 * label and a button that reloads the page.
 */
export class MapRecovery extends Component<MapRecoveryProps, MapRecoveryState> {
  state: MapRecoveryState = { generation: 0, recoveries: 0, stopped: false };

  /** Throws caught here, above every map's own boundary. */
  private strays = 0;

  /** A throw from a map that is already unmounting (its cleanup) lands here, above that map's
   *  own boundary. The map has been given up, so the state stands and no rebuild is counted;
   *  catching it is the point. React mounts the current map once more as it recovers. */
  static getDerivedStateFromError(): null {
    return null;
  }

  /** That remount is an unmount too, so a cleanup that throws every time would come back here
   *  without end. These throws get the same allowance as the rebuilds, then the map stops. */
  componentDidCatch(): void {
    this.strays += 1;
    if (this.strays <= MAX_RECOVERIES || this.state.stopped) return;
    this.props.onMapLost();
    this.setState({ stopped: true });
  }

  /** One dead map can report twice: its context goes, and a write to it throws before React
   *  has mounted the next one. The report names its generation, so only the first counts. */
  private giveUp = (generation: number): void => {
    this.props.onMapLost();
    // Deliberate shortcut: the count is per page load and never resets, so a fourth failure in
    // one long session offers the reload even when the first three were hours apart.
    this.setState((s) => {
      if (s.stopped || s.generation !== generation) return null;
      return s.recoveries >= MAX_RECOVERIES
        ? { ...s, stopped: true }
        : { generation: s.generation + 1, recoveries: s.recoveries + 1, stopped: false };
    });
  };

  render(): ReactNode {
    const { generation, stopped } = this.state;
    if (stopped) return <MapStopped />;
    return (
      <MapGeneration key={generation} generation={generation} onDead={this.giveUp}>
        {this.props.children(generation)}
      </MapGeneration>
    );
  }
}

interface MapGenerationProps {
  generation: number;
  onDead: (generation: number) => void;
  children: ReactNode;
}

/** One mounted map: catches a throw from its tree, hears its canvas lose its context. */
class MapGeneration extends Component<MapGenerationProps, { dead: boolean }> {
  state = { dead: false };

  private host = createRef<HTMLDivElement>();

  static getDerivedStateFromError(): { dead: boolean } {
    return { dead: true };
  }

  componentDidMount(): void {
    this.host.current?.addEventListener("webglcontextlost", this.report, true);
  }

  componentDidCatch(): void {
    this.report();
  }

  componentWillUnmount(): void {
    this.host.current?.removeEventListener("webglcontextlost", this.report, true);
  }

  private report = (): void => {
    this.props.onDead(this.props.generation);
  };

  render(): ReactNode {
    return (
      // display: contents, so the host puts no box between the app's root and the map.
      <div ref={this.host} className="contents">
        {this.state.dead ? null : this.props.children}
      </div>
    );
  }
}

/** What stands where the map was once it is not rebuilt again. */
function MapStopped() {
  return (
    <div className="absolute inset-0 grid place-items-center">
      <Panel material="instrument" radius="md" role="alert" className="px-3 py-2.5 flex flex-col items-center gap-2">
        <Eyebrow>Map stopped</Eyebrow>
        {/* An edged, square-cornered control. A bare word under the label read as a second
            label; an edged Pill, or rounded-sm (9 px in this scale), draws the capsule the look
            refresh removed. */}
        <FocusButton
          variant="chip"
          onClick={() => window.location.reload()}
          className="rounded-xs border border-dim px-2.5 py-1 font-mono text-[10px] uppercase tracking-widest transition active:scale-[0.97]"
          style={{ color: "var(--text)" }}
        >
          Reload page
        </FocusButton>
      </Panel>
    </div>
  );
}

type GlobeMapProps = ComponentProps<typeof GlobeMap>;

type RecoveringGlobeMapProps = Omit<GlobeMapProps, "onMapReady"> & {
  /** As GlobeMap's, and called with null when a map is given up. */
  onMapReady?: (map: maplibregl.Map | null) => void;
};

/** GlobeMap inside MapRecovery: what the app mounts. */
export function RecoveringGlobeMap(props: RecoveringGlobeMapProps) {
  const { onMapReady } = props;
  return (
    <MapRecovery onMapLost={() => onMapReady?.(null)}>{() => <GlobeMap {...props} />}</MapRecovery>
  );
}
