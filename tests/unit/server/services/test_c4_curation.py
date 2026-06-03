"""C4 legibility: curated KG layers feed the architecture view, and the L1/L2
Mermaid groups externals by category once there are many (plan §Phase 5)."""

from __future__ import annotations

from repowise.server.services.c4_builder.architecture import (
    _layers_from_knowledge_graph,
)
from repowise.server.services.c4_builder.mermaid import to_mermaid_l1
from repowise.server.services.c4_builder.models import (
    C4L1,
    ExternalSystemView,
    Person,
    Relation,
    System,
)

# ---------------------------------------------------------------------------
# Curated layers flow through the architecture cascade (tier 2: KG file)
# ---------------------------------------------------------------------------


def test_architecture_view_consumes_curated_layers():
    kg = {
        "layers": [
            {
                "id": "layer:ui",
                "name": "UI",
                "description": "front end",
                "nodeIds": ["file:src/ui/a.tsx", "file:src/ui/b.tsx"],
            },
            {
                "id": "layer:service",
                "name": "Service",
                "description": "core",
                "nodeIds": ["file:src/core/x.py"],
            },
        ]
    }
    node_ids = {"src/ui/a.tsx", "src/ui/b.tsx", "src/core/x.py"}
    layers = _layers_from_knowledge_graph(kg, node_ids)

    # Curated names/ids/order preserved — not community-N / cluster-N.
    assert [layer["name"] for layer in layers] == ["UI", "Service"]
    assert [layer["id"] for layer in layers] == ["layer:ui", "layer:service"]
    assert layers[0]["node_ids"] == ["src/ui/a.tsx", "src/ui/b.tsx"]


def _ext(name: str, category: str) -> ExternalSystemView:
    return ExternalSystemView(
        id=f"ext:{name}",
        name=name,
        display_name=name,
        category=category,
        ecosystem="pypi",
        version="",
    )


def _l1(externals: list[ExternalSystemView]) -> C4L1:
    system = System(id="sys:r", name="r")
    return C4L1(
        system=system,
        people=[Person(id="person:user", name="User", description="")],
        external_systems=externals,
        relations=[
            Relation(source_id=system.id, target_id=e.id, label=e.category) for e in externals
        ],
    )


# ---------------------------------------------------------------------------
# Mermaid external grouping
# ---------------------------------------------------------------------------


def test_few_externals_stay_flat():
    externals = [_ext(f"lib{i}", "library") for i in range(4)]
    out = to_mermaid_l1(_l1(externals))
    assert "Boundary(extgrp_" not in out


def test_many_externals_group_by_category():
    externals = (
        [_ext(f"fw{i}", "framework") for i in range(4)]
        + [_ext(f"svc{i}", "service") for i in range(3)]
        + [_ext(f"lib{i}", "library") for i in range(5)]
    )
    out = to_mermaid_l1(_l1(externals))
    assert "Boundary(extgrp_framework" in out
    assert "Boundary(extgrp_service" in out
    assert "Boundary(extgrp_library" in out
    assert '"Frameworks"' in out
    assert '"Services & Infrastructure"' in out
    # Frameworks group is rendered before Libraries (category priority order).
    assert out.index("extgrp_framework") < out.index("extgrp_library")
    # Every external still appears as a box.
    for i in range(5):
        assert f"ext_lib{i}" in out
