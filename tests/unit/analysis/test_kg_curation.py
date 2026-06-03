"""Tests for the KG curation/presentation pass (``kg_curation``).

Grows phase-by-phase. Phase 0 locks the seam: a no-op when the flag is off, a
flag reader, and the AST-graph-untouched guard.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from types import SimpleNamespace
from typing import Any
from unittest.mock import MagicMock

import pytest

from repowise.core.analysis.kg_curation import curate_knowledge_graph, curation_enabled
from repowise.core.analysis.knowledge_graph import (
    KnowledgeGraphResult,
    build_knowledge_graph_skeleton,
)

# ---------------------------------------------------------------------------
# Fixtures / fakes
# ---------------------------------------------------------------------------


@dataclass
class FakeFileInfo:
    path: str
    language: str = "python"
    size_bytes: int = 1000
    is_test: bool = False
    is_config: bool = False
    is_api_contract: bool = False
    is_entry_point: bool = False
    line_count: int = 100


@dataclass
class FakeSymbol:
    name: str = "my_func"
    kind: str = "function"
    start_line: int = 1
    end_line: int = 10
    is_reexport: bool = False


@dataclass
class FakeParsedFile:
    file_info: FakeFileInfo
    symbols: list = field(default_factory=list)
    imports: list = field(default_factory=list)
    exports: list = field(default_factory=list)


def _make_graph_builder(
    nodes: dict[str, dict],
    edges: list[tuple[str, str, dict]],
    communities: dict[str, int],
    community_infos: dict[int, Any],
    pagerank: dict[str, float],
    betweenness: dict[str, float] | None = None,
):
    import networkx as nx

    g = nx.DiGraph()
    for nid, data in nodes.items():
        g.add_node(nid, **data)
    for u, v, data in edges:
        g.add_edge(u, v, **data)

    builder = MagicMock()
    builder.graph.return_value = g
    builder.pagerank.return_value = pagerank
    builder.betweenness_centrality.return_value = betweenness or {}
    builder.community_detection.return_value = communities
    builder.community_info.return_value = community_infos
    return builder


def _community_info(cid: int, label: str, members: list[str]):
    return SimpleNamespace(
        community_id=cid,
        label=label,
        members=members,
        size=len(members),
        cohesion=0.8,
        dominant_language="python",
    )


@pytest.fixture
def simple_repo():
    """A tiny three-file repo: entry, core, test."""
    parsed = [
        FakeParsedFile(
            FakeFileInfo("src/main.py", is_entry_point=True), symbols=[FakeSymbol("main")]
        ),
        FakeParsedFile(FakeFileInfo("src/core.py"), symbols=[FakeSymbol("Core", "class")]),
        FakeParsedFile(
            FakeFileInfo("tests/test_main.py", is_test=True), symbols=[FakeSymbol("test_main")]
        ),
    ]
    nodes = {
        "src/main.py": {"node_type": "file", "language": "python", "is_entry_point": True},
        "src/core.py": {"node_type": "file", "language": "python"},
        "tests/test_main.py": {"node_type": "file", "language": "python", "is_test": True},
    }
    edges = [
        ("src/main.py", "src/core.py", {"edge_type": "imports", "confidence": 1.0}),
        ("tests/test_main.py", "src/main.py", {"edge_type": "imports", "confidence": 1.0}),
    ]
    communities = {"src/main.py": 0, "src/core.py": 0, "tests/test_main.py": 1}
    infos = {
        0: _community_info(0, "src/core", ["src/main.py", "src/core.py"]),
        1: _community_info(1, "tests", ["tests/test_main.py"]),
    }
    pagerank = {"src/main.py": 0.5, "src/core.py": 0.3, "tests/test_main.py": 0.2}
    builder = _make_graph_builder(nodes, edges, communities, infos, pagerank)
    repo_structure = SimpleNamespace(
        is_monorepo=False,
        total_files=3,
        entry_points=["src/main.py"],
    )
    return SimpleNamespace(parsed=parsed, builder=builder, repo_structure=repo_structure)


def _build_skeleton(repo) -> KnowledgeGraphResult:
    return build_knowledge_graph_skeleton(
        parsed_files=repo.parsed,
        graph_builder=repo.builder,
        repo_structure=repo.repo_structure,
        tech_stack=[],
        external_systems=[],
    )


def _curate(repo, **kw) -> KnowledgeGraphResult:
    return curate_knowledge_graph(
        _build_skeleton(repo),
        parsed_files=repo.parsed,
        graph_builder=repo.builder,
        repo_structure=repo.repo_structure,
        community_info=repo.builder.community_info(),
        **kw,
    )


# ---------------------------------------------------------------------------
# Phase 0 — the seam
# ---------------------------------------------------------------------------


class TestCurationFlag:
    def test_default_off(self, monkeypatch):
        monkeypatch.delenv("REPOWISE_KG_CURATION", raising=False)
        assert curation_enabled() is False

    @pytest.mark.parametrize("val", ["1", "true", "TRUE", "yes", "on"])
    def test_truthy_values_enable(self, monkeypatch, val):
        monkeypatch.setenv("REPOWISE_KG_CURATION", val)
        assert curation_enabled() is True

    @pytest.mark.parametrize("val", ["0", "false", "no", "off", "", "garbage"])
    def test_falsy_values_disable(self, monkeypatch, val):
        monkeypatch.setenv("REPOWISE_KG_CURATION", val)
        assert curation_enabled() is False


class TestIdentityPass:
    def test_noop_returns_input_unchanged(self, simple_repo):
        kg = _build_skeleton(simple_repo)
        before = kg.to_dict()
        out = curate_knowledge_graph(
            kg,
            parsed_files=simple_repo.parsed,
            graph_builder=simple_repo.builder,
            repo_structure=simple_repo.repo_structure,
            community_info=simple_repo.builder.community_info(),
            enabled=False,
        )
        assert out is kg
        assert out.to_dict() == before

    def test_ast_graph_untouched(self, simple_repo):
        """The §4D guard: graph node/edge counts identical pre/post curation."""
        g = simple_repo.builder.graph()
        before = (g.number_of_nodes(), g.number_of_edges())
        _curate(simple_repo, enabled=True)
        g = simple_repo.builder.graph()
        assert (g.number_of_nodes(), g.number_of_edges()) == before
