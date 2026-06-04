/**
 * The curated "layer-groups" navigation tier (viewer plan B-2).
 *
 * Overview → layer cards; drilling into a layer with curated sub_groups lands
 * on sub-group cards only; drilling into one group shows its files with the
 * sibling groups as collapsed cards. Layers without sub-groups skip the tier
 * entirely (locked decision 1).
 */
import { describe, it, expect, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import { useArchitectureStore } from "../../src/c4/store/use-architecture-store";
import { useArchitectureLayout } from "../../src/c4/hooks/use-architecture-layout";
import { createMockView } from "./fixtures";
import type { ArchitectureView } from "../../src/c4/types";

const store = useArchitectureStore;

/** Fixture view: layer:api curated into two sub-groups, layer:core uncurated. */
function createCuratedView(): ArchitectureView {
  const base = createMockView();
  return {
    ...base,
    layers: [
      {
        ...base.layers[0]!,
        id: "layer:api",
        name: "API",
        node_ids: ["src/app.py", "src/routes.py"],
        sub_groups: [
          { id: "layer:api:app", name: "app", node_ids: ["src/app.py"] },
          { id: "layer:api:routes", name: "routes", node_ids: ["src/routes.py"] },
        ],
        display_order: 0,
      },
      {
        ...base.layers[1]!,
        id: "layer:core",
        name: "Core",
        node_ids: ["src/models.py"],
        sub_groups: [],
        display_order: 1,
      },
    ],
  };
}

beforeEach(() => {
  store.setState(store.getInitialState());
});

describe("store: layer-groups navigation", () => {
  it("drillIntoLayer lands on layer-groups when the layer has sub_groups", () => {
    store.getState().setView(createCuratedView());
    store.getState().drillIntoLayer("layer:api");
    const state = store.getState();
    expect(state.navigationLevel).toBe("layer-groups");
    expect(state.activeLayerId).toBe("layer:api");
    expect(state.activeSubGroupId).toBeNull();
  });

  it("drillIntoLayer skips the tier for layers without sub_groups (decision 1)", () => {
    store.getState().setView(createCuratedView());
    store.getState().drillIntoLayer("layer:core");
    expect(store.getState().navigationLevel).toBe("layer-detail");
    expect(store.getState().activeSubGroupId).toBeNull();
  });

  it("drillIntoSubGroup scopes layer-detail to the group", () => {
    store.getState().setView(createCuratedView());
    store.getState().drillIntoLayer("layer:api");
    store.getState().drillIntoSubGroup("layer:api:app");
    const state = store.getState();
    expect(state.navigationLevel).toBe("layer-detail");
    expect(state.activeLayerId).toBe("layer:api");
    expect(state.activeSubGroupId).toBe("layer:api:app");
  });

  it("drillOut steps detail → groups → overview", () => {
    store.getState().setView(createCuratedView());
    store.getState().drillIntoLayer("layer:api");
    store.getState().drillIntoSubGroup("layer:api:app");

    store.getState().drillOut();
    expect(store.getState().navigationLevel).toBe("layer-groups");
    expect(store.getState().activeLayerId).toBe("layer:api");
    expect(store.getState().activeSubGroupId).toBeNull();

    store.getState().drillOut();
    expect(store.getState().navigationLevel).toBe("overview");
    expect(store.getState().activeLayerId).toBeNull();
  });

  it("drillOut from an uncurated layer goes straight to overview", () => {
    store.getState().setView(createCuratedView());
    store.getState().drillIntoLayer("layer:core");
    store.getState().drillOut();
    expect(store.getState().navigationLevel).toBe("overview");
  });

  it("selectNode auto-drills to the node's layer AND sub-group", () => {
    store.getState().setView(createCuratedView());
    store.getState().selectNode("src/routes.py");
    const state = store.getState();
    expect(state.navigationLevel).toBe("layer-detail");
    expect(state.activeLayerId).toBe("layer:api");
    expect(state.activeSubGroupId).toBe("layer:api:routes");
    expect(state.selectedNodeId).toBe("src/routes.py");
  });

  it("tour steps drill into the step node's sub-group", () => {
    store.getState().setView(createCuratedView());
    store.getState().startTour();
    // First tour step targets src/app.py (fixture).
    expect(store.getState().activeSubGroupId).toBe("layer:api:app");
    store.getState().nextTourStep();
    expect(store.getState().activeSubGroupId).toBe("layer:api:routes");
  });
});

describe("layout: layer-groups tier", () => {
  it("renders only sub-group cards (+ portals) — never file cards", async () => {
    act(() => {
      store.getState().setView(createCuratedView());
      store.getState().drillIntoLayer("layer:api");
    });
    const { result } = renderHook(() => useArchitectureLayout());

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
      expect(result.current.nodes.length).toBeGreaterThan(0);
    });

    const types = result.current.nodes.map((n) => n.type);
    expect(types).not.toContain("archFile");
    expect(types.filter((t) => t === "subGroupCluster")).toHaveLength(2);
    // Cross-layer edges to layer:core collapse into a portal stub.
    expect(types).toContain("portal");

    const cardIds = result.current.nodes.map((n) => n.id);
    expect(cardIds).toContain("layer:api:app");
    expect(cardIds).toContain("layer:api:routes");

    // One aggregated, labelled arrow between the two visible cards.
    const aggEdge = result.current.edges.find(
      (e) => e.source === "layer:api:app" && e.target === "layer:api:routes",
    );
    expect(aggEdge).toBeDefined();
  });

  it("collects curation leftovers into an 'Other files' card", async () => {
    const view = createCuratedView();
    view.layers[0]!.sub_groups = [
      { id: "layer:api:app", name: "app", node_ids: ["src/app.py"] },
    ];
    act(() => {
      store.getState().setView(view);
      store.getState().drillIntoLayer("layer:api");
    });
    const { result } = renderHook(() => useArchitectureLayout());

    await waitFor(() => {
      expect(result.current.nodes.length).toBeGreaterThan(0);
    });

    const ungrouped = result.current.nodes.find((n) => n.id === "layer:api:__ungrouped");
    expect(ungrouped).toBeDefined();
    expect(ungrouped!.type).toBe("subGroupCluster");
    expect((ungrouped!.data as { layer: { node_ids: string[] } }).layer.node_ids).toEqual([
      "src/routes.py",
    ]);
  });

  it("layer-detail scoped to one group shows its files + sibling collapsed cards", async () => {
    act(() => {
      store.getState().setView(createCuratedView());
      store.getState().drillIntoLayer("layer:api");
      store.getState().drillIntoSubGroup("layer:api:app");
    });
    const { result } = renderHook(() => useArchitectureLayout());

    await waitFor(() => {
      expect(result.current.nodes.length).toBeGreaterThan(0);
    });

    const fileIds = result.current.nodes.filter((n) => n.type === "archFile").map((n) => n.id);
    expect(fileIds).toEqual(["src/app.py"]); // scoped — never the whole layer

    const sibling = result.current.nodes.find((n) => n.id === "layer:api:routes");
    expect(sibling).toBeDefined();
    expect(sibling!.type).toBe("subGroupCluster");

    // The in-layer cross-group edge aggregates file/card → sibling card.
    const toSibling = result.current.edges.find((e) => e.target === "layer:api:routes");
    expect(toSibling).toBeDefined();
  });

  it("uncurated layers keep today's layer-detail behaviour", async () => {
    act(() => {
      store.getState().setView(createCuratedView());
      store.getState().drillIntoLayer("layer:core");
    });
    const { result } = renderHook(() => useArchitectureLayout());

    await waitFor(() => {
      expect(result.current.nodes.length).toBeGreaterThan(0);
    });

    const types = result.current.nodes.map((n) => n.type);
    expect(types).toContain("archFile");
    expect(types).not.toContain("subGroupCluster");
  });
});
