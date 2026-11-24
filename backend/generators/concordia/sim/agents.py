# backend/generators/concordia/sim/agents.py
"""Assembles the Concordia Config: a victim + a fraudster basic.Entity and a
generic GameMaster. Persona/goal carry the constrained-format instruction (there
is no system_prompt param on basic.Entity - verified fact #5). prefab map built
via get_package_classes (keys like 'basic__Entity', 'generic__GameMaster')."""

from __future__ import annotations

import concordia.prefabs.entity as entity_prefabs
import concordia.prefabs.game_master as gm_prefabs
from concordia.typing import prefab as prefab_lib
from concordia.utils import helper_functions


def build_config(max_steps: int = 6, scenario: str = "card-fraud") -> prefab_lib.Config:
    from ..scenarios import SCENARIOS

    cfg = SCENARIOS[scenario]
    prefabs = {
        **helper_functions.get_package_classes(entity_prefabs),
        **helper_functions.get_package_classes(gm_prefabs),
    }
    instances = [
        prefab_lib.InstanceConfig(
            prefab="basic__Entity",
            role=prefab_lib.Role.ENTITY,
            params={"name": "Victim", "goal": cfg.victim_goal},
        ),
        prefab_lib.InstanceConfig(
            prefab="basic__Entity",
            role=prefab_lib.Role.ENTITY,
            params={"name": "Fraudster", "goal": cfg.fraudster_goal},
        ),
        prefab_lib.InstanceConfig(
            prefab="generic__GameMaster",
            role=prefab_lib.Role.GAME_MASTER,
            params={"name": "GM", "acting_order": "fixed"},
        ),
    ]
    return prefab_lib.Config(
        prefabs=prefabs,
        instances=instances,
        default_premise=cfg.premise,
        default_max_steps=max_steps,
    )
