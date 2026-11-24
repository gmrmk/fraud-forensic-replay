import { useRef, type ComponentProps, type ReactElement } from "react";
import { useLayers } from "../store/layers";
import { useMarksStore } from "../store/marks";
import { LayerPanels } from "./LayerPanels";
import { PathPanel, offeredPathKinds } from "./PathPanel";
import { DrawStrip } from "./paths/DrawStrip";
import { TopMenu } from "./TopMenu";

/**
 * The two map menus the top bar mounts in a case: a Layers button with the layer rows, and a
 * Paths button with one switch per path kind the case offers, then the investigator's own paths.
 * Both are always drawn, even when no path is on offer (the Paths menu then says so), because the
 * bar is centred and a button that appeared when the data arrived would shift every control beside
 * it. Each menu's scroller shows the foot shade while more lies below.
 *
 * The drawing strip of the investigator's own paths is mounted after the two menus, outside both,
 * so focus moving into it closes the Paths menu that started it. It draws nothing without a draft.
 */
export function MapMenus(props: ComponentProps<typeof LayerPanels>): ReactElement {
  const pathKinds = useLayers((s) => s.pathKinds);
  const paths = offeredPathKinds(pathKinds, props);
  // The Paths menu is wide while the scenario holds a path of the investigator's, narrow otherwise.
  const hasSavedPath = useMarksStore((s) => s.paths.length > 0);
  const pathsWidth = hasSavedPath ? "wide" : "narrow";
  // The Paths menu's root, so a finished or dropped draft can give the focus back to its button.
  const pathsRoot = useRef<HTMLDivElement>(null);
  return (
    <>
      <TopMenu label="Layers" width="wide" footCue>
        <LayerPanels {...props} />
      </TopMenu>
      <div ref={pathsRoot} className="contents">
        <TopMenu label="Paths" width={pathsWidth} footCue>
          <PathPanel kinds={paths} />
        </TopMenu>
      </div>
      <DrawStrip returnFocus={() => pathsRoot.current?.querySelector("button")?.focus()} />
    </>
  );
}
