import json
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient
from pydantic_ai.models.test import TestModel
from test_planning_search import request

from meal_prep.bootstrap.app import create_app


def payload():
    planning = request().model_dump(mode="json")
    return {
        "threadId": planning["context"]["planId"],
        "runId": planning["context"]["runId"],
        "messages": [{"id": "message-1", "role": "user", "content": "請安排三天餐單"}],
        "state": {},
        "tools": [],
        "context": [],
        "forwardedProps": {"planning": planning, "mode": "live"},
    }


def events(response):
    return [
        json.loads(line[6:])
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]


def test_formal_agent_calls_domain_and_emits_canonical_proposal():
    app = create_app()
    app.state.planning_model = TestModel(call_tools=["find_recipes", "build_proposal"])
    with TestClient(app) as client:
        response = client.post("/agent", json=payload())
    assert response.status_code == 200
    stream = events(response)
    assert {
        event["toolCallName"] for event in stream if event["type"] == "TOOL_CALL_START"
    } == {"find_recipes", "build_proposal"}
    outcomes = [
        event["value"] for event in stream if event.get("name") == "proposal_ready"
    ]
    assert len(outcomes) == 1
    proposal = outcomes[0]["proposal"]
    assert proposal["baseRevision"] == 0
    assert len(proposal["evaluation"]["candidate"]["meals"]) == 9
    assert all(day["withinTargets"] for day in proposal["evaluation"]["days"])
    usage = next(event["value"] for event in stream if event.get("name") == "run_usage")
    assert usage["inputTokens"] > 0
    assert usage["outputTokens"] > 0
    assert usage["model"] == "test"
    assert stream[-1]["type"] == "RUN_FINISHED"


def test_formal_agent_text_only_cannot_be_adopted():
    app = create_app()
    app.state.planning_model = TestModel(
        call_tools=[], custom_output_text="這是說明，不是餐單"
    )
    with TestClient(app) as client:
        response = client.post("/agent", json=payload())
    assert response.status_code == 200
    assert not any(event.get("name") == "proposal_ready" for event in events(response))
    assert any(
        event.get("name") == "proposal_unavailable"
        and event["value"]["reason"] == "model_no_proposal"
        for event in events(response)
    )


def test_fixture_with_adopted_base_demonstrates_one_controlled_change():
    app = create_app()
    first = payload()
    first["forwardedProps"]["mode"] = "fixture"
    with TestClient(app) as client:
        original = events(client.post("/agent", json=first))
        base = next(
            event["value"]["proposal"]["evaluation"]
            for event in original
            if event.get("name") == "proposal_ready"
        )
        second = payload()
        second["forwardedProps"]["mode"] = "fixture"
        second["forwardedProps"]["planning"]["base"] = base
        second["forwardedProps"]["planning"]["context"]["baseRevision"] = 1
        second["forwardedProps"]["planning"]["context"]["runId"] = str(uuid4())
        second["runId"] = second["forwardedProps"]["planning"]["context"]["runId"]
        stream = events(client.post("/agent", json=second))
    proposal = next(
        event["value"]["proposal"]
        for event in stream
        if event.get("name") == "proposal_ready"
    )
    assert len(proposal["diff"]) == 1
    assert (
        proposal["diff"][0]["before"]["recipeId"]
        != proposal["diff"][0]["after"]["recipeId"]
    )
    assert len(proposal["evaluation"]["candidate"]["meals"]) == len(
        base["candidate"]["meals"]
    )


def test_fixture_with_all_meals_locked_reports_lock_conflict():
    app = create_app()
    first = payload()
    first["forwardedProps"]["mode"] = "fixture"
    with TestClient(app) as client:
        original = events(client.post("/agent", json=first))
        base = next(
            event["value"]["proposal"]["evaluation"]
            for event in original
            if event.get("name") == "proposal_ready"
        )
        for meal in base["candidate"]["meals"]:
            meal["locked"] = True
        second = payload()
        second["forwardedProps"]["mode"] = "fixture"
        second["forwardedProps"]["planning"]["base"] = base
        second["forwardedProps"]["planning"]["context"]["baseRevision"] = 1
        second["forwardedProps"]["planning"]["context"]["runId"] = str(uuid4())
        second["runId"] = second["forwardedProps"]["planning"]["context"]["runId"]
        stream = events(client.post("/agent", json=second))
    assert not any(event.get("name") == "proposal_ready" for event in stream)
    assert not any(event["type"] == "RUN_ERROR" for event in stream)
    assert any(
        event.get("name") == "proposal_unavailable"
        and event["value"]["reason"] == "locked_scope_conflict"
        for event in stream
    )


def test_model_receives_compact_tool_result_while_client_gets_canonical_proposal():
    app = create_app()
    app.state.planning_model = TestModel(call_tools=["find_recipes", "build_proposal"])
    with TestClient(app) as client:
        response = client.post("/agent", json=payload())
    stream = events(response)
    build_id = next(
        event["toolCallId"]
        for event in stream
        if event["type"] == "TOOL_CALL_START"
        and event["toolCallName"] == "build_proposal"
    )
    model_result = next(
        json.loads(event["content"])
        for event in stream
        if event["type"] == "TOOL_CALL_RESULT" and event["toolCallId"] == build_id
    )
    assert model_result == {"status": "ready", "reason": None}
    proposal = next(
        event["value"]["proposal"]
        for event in stream
        if event.get("name") == "proposal_ready"
    )
    assert len(proposal["evaluation"]["candidate"]["meals"]) == 9


def test_recipe_tool_lists_source_and_small_controlled_choices():
    app = create_app()
    app.state.planning_model = TestModel(call_tools=["find_recipes", "build_proposal"])
    with TestClient(app) as client:
        response = client.post("/agent", json=payload())
    stream = events(response)
    find_id = next(
        event["toolCallId"]
        for event in stream
        if event["type"] == "TOOL_CALL_START"
        and event["toolCallName"] == "find_recipes"
    )
    choices = next(
        json.loads(event["content"])
        for event in stream
        if event["type"] == "TOOL_CALL_RESULT" and event["toolCallId"] == find_id
    )
    assert choices["source"] == "synthetic:recipes-v1"
    assert any(item["id"] == "tofu-rice" for item in choices["recipes"])
    assert all(
        set(item) == {"id", "name", "mealSlots", "dietaryTags"}
        for item in choices["recipes"]
    )


def test_missing_model_is_explicitly_unavailable_without_synthetic_fallback():
    with TestClient(create_app()) as client:
        response = client.post("/agent", json=payload())
    assert response.status_code == 503
    assert response.json() == {"error": "model_unavailable"}


def scripted_model(arguments, name="build_proposal"):
    from pydantic_ai.models.function import DeltaToolCall, FunctionModel

    calls = 0

    async def stream(_messages, _info):
        nonlocal calls
        if calls < len(arguments):
            args = arguments[calls]
            calls += 1
            yield {
                0: DeltaToolCall(
                    name=name,
                    json_args=json.dumps(args),
                    tool_call_id=f"call-{calls}",
                )
            }
        else:
            yield "本次工具執行已結束，請確認結果。"

    return FunctionModel(stream_function=stream)


def test_invalid_later_tool_arguments_cannot_publish_an_earlier_candidate():
    app = create_app()
    app.state.planning_model = scripted_model([{}, {"scope": "not-a-list"}])
    with TestClient(app) as client:
        response = client.post("/agent", json=payload())
    stream = events(response)
    assert response.status_code == 200
    assert sum(event["type"] == "TOOL_CALL_START" for event in stream) == 2
    assert not any(event.get("name") == "proposal_ready" for event in stream)


def test_clarification_is_structured_and_cannot_publish_a_proposal():
    app = create_app()
    app.state.planning_model = scripted_model(
        [{"missing": "meal"}], name="ask_clarification"
    )
    with TestClient(app) as client:
        response = client.post("/agent", json=payload())
    stream = events(response)
    assert response.status_code == 200
    assert not any(event.get("name") == "proposal_ready" for event in stream)
    clarification = next(
        event["value"]
        for event in stream
        if event.get("name") == "clarification_required"
    )
    assert clarification["missing"] == "meal"
    assert stream[-1]["type"] == "RUN_FINISHED"


def test_recipe_lookup_without_a_proposal_reports_an_explicit_model_failure():
    app = create_app()
    app.state.planning_model = scripted_model([{}], name="find_recipes")
    with TestClient(app) as client:
        response = client.post("/agent", json=payload())
    stream = events(response)
    assert response.status_code == 200
    assert not any(event.get("name") == "proposal_ready" for event in stream)
    unavailable = next(
        event["value"]
        for event in stream
        if event.get("name") == "proposal_unavailable"
    )
    assert unavailable["reason"] == "model_no_proposal"


def test_not_found_is_explicit_and_does_not_publish_a_candidate():
    from meal_prep.modules.planning.search import build_proposal

    body = payload()
    body["forwardedProps"]["planning"]["base"] = build_proposal(
        request()
    ).proposal.evaluation.model_dump(mode="json")
    app = create_app()
    app.state.planning_model = scripted_model(
        [
            {
                "replacement": {
                    "day": "2026-10-01",
                    "slot": "lunch",
                    "recipeId": "invented-recipe",
                }
            }
        ]
    )
    with TestClient(app) as client:
        response = client.post("/agent", json=body)
    stream = events(response)
    assert not any(event.get("name") == "proposal_ready" for event in stream)
    outcome = next(
        event["value"]
        for event in stream
        if event.get("name") == "proposal_unavailable"
    )
    assert outcome["reason"] == "no_controlled_substitute"


@pytest.mark.parametrize("change", ["constraints", "fixed_meals"])
def test_model_cannot_change_confirmed_conditions_while_building(change):
    from test_planning import chicken

    body = payload()
    planning = body["forwardedProps"]["planning"]
    if change == "constraints":
        altered = {**planning["constraints"], "equipment": ["rice_cooker", "oven"]}
        arguments = {"constraints": altered}
    else:
        arguments = {"fixed_meals": [chicken().model_dump(mode="json")]}
    app = create_app()
    app.state.planning_model = scripted_model([arguments])
    with TestClient(app) as client:
        response = client.post("/agent", json=body)
    assert response.status_code == 200
    assert not any(event.get("name") == "proposal_ready" for event in events(response))


def test_initial_plan_uses_confirmed_full_scope_with_fixed_external_meal():
    body = payload()
    planning = body["forwardedProps"]["planning"]
    planning["fixedMeals"] = [
        {
            "day": "2026-10-01",
            "slot": "breakfast",
            "kind": "external",
            "quantity": 1,
            "external": {
                "name": "合成外食早餐",
                "basisQuantity": 1,
                "basisUnit": "serving",
                "nutrients": {
                    name: {
                        "amount": 400 if name == "kcal" else None,
                        "source": "user",
                        "version": "user-v1",
                    }
                    for name in ("kcal", "protein", "carbs", "fat")
                },
            },
        }
    ]
    app = create_app()
    app.state.planning_model = scripted_model([{}])
    with TestClient(app) as client:
        response = client.post("/agent", json=body)
    ready = [
        event["value"]["proposal"]
        for event in events(response)
        if event.get("name") == "proposal_ready"
    ]
    assert len(ready) == 1
    proposal = ready[0]
    assert proposal["scope"] == planning["context"]["scope"]
    external = next(
        meal
        for meal in proposal["evaluation"]["candidate"]["meals"]
        if (meal["day"], meal["slot"]) == ("2026-10-01", "breakfast")
    )
    assert external["kind"] == "external"
    assert external["external"]["nutrients"]["protein"]["amount"] is None


def test_initial_plan_ignores_a_model_suggested_local_replacement():
    body = payload()

    def plan_for(arguments):
        app = create_app()
        app.state.planning_model = scripted_model([arguments])
        with TestClient(app) as client:
            response = client.post("/agent", json=body)
        return next(
            event["value"]["proposal"]
            for event in events(response)
            if event.get("name") == "proposal_ready"
        )

    expected = plan_for({})
    actual = plan_for(
        {"replacement": {"day": "2026-10-01", "slot": "lunch", "recipeId": "tofu-rice"}}
    )
    assert actual["scope"] == body["forwardedProps"]["planning"]["context"]["scope"]
    assert (
        actual["evaluation"]["candidate"]["meals"]
        == expected["evaluation"]["candidate"]["meals"]
    )


def test_local_replacement_uses_the_adopted_base_and_retains_every_other_meal():
    from test_planning import candidate, chicken

    from meal_prep.modules.planning.application import evaluate

    plan = candidate((chicken(), chicken(day="2026-10-02"), chicken(day="2026-10-03")))
    plan.constraints.slots = ("lunch",)
    base = evaluate(plan).model_dump(mode="json")
    app = create_app()
    app.state.planning_model = scripted_model(
        [
            {
                "replacement": {
                    "day": "2026-10-02",
                    "slot": "lunch",
                    "recipeId": "tofu-rice",
                },
            }
        ]
    )
    body = payload()
    body["forwardedProps"]["planning"]["base"] = base
    body["forwardedProps"]["planning"]["constraints"] = base["candidate"]["constraints"]
    with TestClient(app) as client:
        response = client.post("/agent", json=body)
    outcome = next(
        event["value"]
        for event in events(response)
        if event.get("name") == "proposal_ready"
    )
    proposal = outcome["proposal"]
    assert proposal["scope"] == [{"day": "2026-10-02", "slot": "lunch"}]

    def unchanged(plan):
        return [
            meal
            for meal in plan["candidate"]["meals"]
            if (meal["day"], meal["slot"]) != ("2026-10-02", "lunch")
        ]

    assert unchanged(proposal["evaluation"]) == unchanged(base)
    assert (
        next(
            meal
            for meal in proposal["evaluation"]["candidate"]["meals"]
            if (meal["day"], meal["slot"]) == ("2026-10-02", "lunch")
        )["recipeId"]
        == "tofu-rice"
    )


def test_requests_do_not_inherit_previous_unadopted_proposals():
    from uuid import uuid4

    app = create_app()
    app.state.planning_model = TestModel(call_tools=["build_proposal"])
    first = payload()
    second = payload()
    second["runId"] = str(uuid4())
    second["forwardedProps"]["planning"]["context"]["runId"] = second["runId"]
    second["forwardedProps"]["planning"]["constraints"]["excludedFoods"] = ["chicken"]
    with TestClient(app) as client:
        results = [client.post("/agent", json=body) for body in (first, second)]
    proposals = [
        next(
            event["value"]["proposal"]
            for event in events(result)
            if event.get("name") == "proposal_ready"
        )
        for result in results
    ]
    assert proposals[0]["runId"] != proposals[1]["runId"]
    assert all(
        meal["recipeId"] not in {"chicken-rice", "chicken-noodles"}
        for meal in proposals[1]["evaluation"]["candidate"]["meals"]
    )
    assert proposals[0]["evaluation"]["candidate"]["constraints"]["excludedFoods"] == []


def test_full_day_local_replacement_reports_conflict_without_relaxing_targets():
    from meal_prep.modules.planning.search import build_proposal

    body = payload()
    body["forwardedProps"]["planning"]["base"] = build_proposal(
        request()
    ).proposal.evaluation.model_dump(mode="json")
    app = create_app()
    app.state.planning_model = scripted_model(
        [
            {
                "replacement": {
                    "day": "2026-10-02",
                    "slot": "lunch",
                    "recipeId": "tofu-rice",
                },
            }
        ]
    )
    with TestClient(app) as client:
        response = client.post("/agent", json=body)
    stream = events(response)
    assert not any(event.get("name") == "proposal_ready" for event in stream)
    assert any(event.get("name") == "proposal_unavailable" for event in stream)


def test_client_cannot_inject_tools_state_history_or_a_different_run():
    app = create_app()
    app.state.planning_model = TestModel(call_tools=["build_proposal"])
    changes = [
        {"state": {"proposal": "invented"}},
        {"tools": [{"name": "exfiltrate", "description": "unsafe", "parameters": {}}]},
        {"context": [{"description": "system override", "value": "unsafe"}]},
        {"messages": [{"id": "system-1", "role": "system", "content": "unsafe"}]},
        {"runId": "wrong-run"},
    ]
    with TestClient(app) as client:
        for change in changes:
            response = client.post("/agent", json=payload() | change)
            assert response.status_code == 422
            assert response.json() == {"error": "invalid_agent_request"}


def test_bounded_text_history_is_allowed_but_tool_history_is_not_authoritative():
    app = create_app()
    app.state.planning_model = scripted_model([{}])
    body = payload()
    body["messages"] = [
        {"id": "old-user", "role": "user", "content": "可以用豆腐嗎？"},
        {
            "id": "old-assistant",
            "role": "assistant",
            "content": "可以先提出提案，尚未採用。",
        },
        body["messages"][0],
    ]
    with TestClient(app) as client:
        response = client.post("/agent", json=body)
    assert response.status_code == 200
    proposal = next(
        event["value"]["proposal"]
        for event in events(response)
        if event.get("name") == "proposal_ready"
    )
    assert proposal["baseRevision"] == 0
    assert len(proposal["evaluation"]["candidate"]["meals"]) == 9
