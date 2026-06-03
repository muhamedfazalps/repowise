"""Curation/presentation pass over the deterministic KG skeleton.

The exported knowledge graph is a *presentation* artifact, distinct from the
AST/dependency graph that powers queries. This module is the single seam where
the skeleton produced by :func:`build_knowledge_graph_skeleton` is reshaped into
something a human (or an AI reading the graph cold) can navigate: bounded,
dependency-ordered layers; a capped, ranked set of real entry points; one
canonical layer-aware tour; typed infra/CI/data nodes; and never-empty
summaries.

**Hard invariant.** Curation reads the NetworkX graph, communities, and
centrality, but it *only ever writes the returned* :class:`KnowledgeGraphResult`.
It never mutates ``graph_builder``'s graph, ``graph_edges``, centrality caches,
community detection, or any DB table. There is a regression test that asserts the
graph's node/edge counts are identical before and after this pass.

Curation is feature-flagged (``REPOWISE_KG_CURATION``) and defaults **off** so
the exported KG is byte-identical to today's until the multi-repo validation
gate passes. With the flag off, :func:`curate_knowledge_graph` is a no-op that
returns its input unchanged.
"""

from __future__ import annotations

import os
from typing import Any

from repowise.core.analysis.knowledge_graph import KnowledgeGraphResult

__all__ = ["curate_knowledge_graph", "curation_enabled"]


_FLAG_ENV = "REPOWISE_KG_CURATION"


def curation_enabled() -> bool:
    """Whether KG curation is enabled via the ``REPOWISE_KG_CURATION`` env flag.

    Defaults to **off**. Any of ``1``/``true``/``yes``/``on`` (case-insensitive)
    turns it on. Resolved at the call site so :func:`curate_knowledge_graph`
    itself stays pure and trivially testable with an explicit ``enabled=``.
    """
    return os.environ.get(_FLAG_ENV, "").strip().lower() in {"1", "true", "yes", "on"}


def curate_knowledge_graph(
    kg: KnowledgeGraphResult,
    *,
    parsed_files: list[Any],
    graph_builder: Any,
    repo_structure: Any,
    community_info: Any,
    enabled: bool = False,
) -> KnowledgeGraphResult:
    """Reshape the KG skeleton into an intuitive presentation artifact.

    Pure with respect to the AST graph: reads ``graph_builder`` /
    ``community_info`` but writes only the returned result. When ``enabled`` is
    ``False`` this is a strict no-op returning ``kg`` unchanged (the default, so
    the exported KG is unaffected until the flag flips).

    Each curation step is added in a later phase and guarded so that a failure
    degrades to the prior (uncurated) field rather than aborting the export.
    """
    if not enabled:
        return kg

    # Curation steps are layered in by subsequent phases:
    #   _curate_layers -> _curate_entry_points -> _curate_tour
    #   -> _curate_node_types -> _curate_summaries
    return kg
