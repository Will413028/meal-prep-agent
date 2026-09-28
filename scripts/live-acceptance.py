"""Opt-in, synthetic-only Workers AI acceptance probe.

Run with the repository's ignored Cloudflare env file. Full model text and
canonical output stay in ignored .artifacts; stdout contains a small summary.
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path
from uuid import uuid4

from fastapi.testclient import TestClient

from meal_prep.bootstrap.live import create_live_app
from meal_prep.modules.planning.application import evaluate
from meal_prep.modules.planning.contracts import MealKey, PlannedMeal

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "backend" / "tests"))
from test_planning import candidate, chicken  # noqa: E402
from test_planning_search import request as planning_request  # noqa: E402


def scenario(name: str):
    planning = planning_request()
    if name == "A1":
        message = "請依已確認的手動目標，安排三天三餐。先查受控食譜再建立未採用提案，請用繁體中文說明。"
    elif name == "A3":
        fixed = PlannedMeal.model_validate(
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
                        key: {
                            "amount": 400 if key == "kcal" else None,
                            "source": "user",
                            "version": "user-v1",
                        }
                        for key in ("kcal", "protein", "carbs", "fat")
                    },
                },
            }
        )
        planning.fixedMeals = (fixed,)
        message = "第一天早餐是已固定的合成外食，只有熱量已知。請安排其餘餐點，保留外食與未知營養，不要列入自煮採買。"
    elif name == "A5":
        plan = candidate(
            (chicken(), chicken(day="2026-10-02"), chicken(day="2026-10-03"))
        )
        plan.constraints.slots = ("lunch",)
        planning.base = evaluate(plan)
        planning.constraints = plan.constraints
        planning.context.scope = (MealKey(day="2026-10-02", slot="lunch"),)
        message = "只把第二天午餐雞肉飯盒換成受控的豆腐飯盒（tofu-rice）；其他日期和餐次完全保留。請先查食譜再提出未採用的局部換菜提案。"
    elif name == "A10":
        planning.constraints.equipment = ()
        message = "目前沒有任何可用烹調設備。請先查受控食譜，再嘗試安排三天三餐；若工具找不到可行提案，明確說明限制，勿宣稱已完成或已保存。"
    else:
        raise ValueError(name)
    run_id = uuid4()
    plan_id = uuid4()
    planning.context.planId = plan_id
    planning.context.sessionGeneration = uuid4()
    planning.context.runId = run_id
    payload = {
        "threadId": str(plan_id),
        "runId": str(run_id),
        "messages": [{"id": str(uuid4()), "role": "user", "content": message}],
        "state": {},
        "tools": [],
        "context": [],
        "forwardedProps": {
            "mode": "live",
            "planning": planning.model_dump(mode="json"),
        },
    }
    return payload


def inspect(name: str, response, elapsed: float, payload: dict):
    events = [
        json.loads(line[6:])
        for line in response.text.splitlines()
        if line.startswith("data: ")
    ]
    ready = [
        event["value"]["proposal"]
        for event in events
        if event.get("name") == "proposal_ready"
    ]
    unavailable = [
        event["value"]
        for event in events
        if event.get("name") == "proposal_unavailable"
    ]
    usage = [event["value"] for event in events if event.get("name") == "run_usage"]
    text = "".join(
        event.get("delta", "")
        for event in events
        if event["type"] == "TEXT_MESSAGE_CONTENT"
    )
    failures = []
    if (
        response.status_code != 200
        or not events
        or events[-1]["type"] != "RUN_FINISHED"
    ):
        failures.append("run_incomplete")
    if any(event["type"] == "RUN_ERROR" for event in events):
        failures.append("run_error")
    if (
        len(usage) != 1
        or usage[0].get("mode") != "live"
        or usage[0].get("model") != "@cf/zai-org/glm-4.7-flash"
    ):
        failures.append("wrong_mode_or_usage")
    tools = [
        event["toolCallName"] for event in events if event["type"] == "TOOL_CALL_START"
    ]
    tool_names = {
        event["toolCallId"]: event["toolCallName"]
        for event in events
        if event["type"] == "TOOL_CALL_START"
    }
    arguments: dict[str, str] = {}
    tool_results = []
    for event in events:
        if event["type"] == "TOOL_CALL_ARGS":
            call_id = event["toolCallId"]
            arguments[call_id] = arguments.get(call_id, "") + event["delta"]
        elif event["type"] == "TOOL_CALL_RESULT":
            try:
                content = json.loads(event["content"])
            except json.JSONDecodeError:
                tool_results.append(
                    {
                        "name": tool_names[event["toolCallId"]],
                        "status": "unparsed",
                        "reason": event["content"][:200],
                    }
                )
                continue
            if isinstance(content, dict) and "status" in content:
                tool_results.append(
                    {
                        "name": tool_names[event["toolCallId"]],
                        "status": content["status"],
                        "reason": content.get("reason"),
                    }
                )
            elif (
                isinstance(content, dict)
                and tool_names[event["toolCallId"]] == "find_recipes"
            ):
                tool_results.append(
                    {
                        "name": "find_recipes",
                        "source": content.get("source"),
                        "recipeIds": [
                            item.get("id") for item in content.get("recipes", [])
                        ],
                    }
                )
    if name in ("A1", "A3", "A5"):
        if len(ready) != 1 or not {"find_recipes", "build_proposal"} <= set(tools):
            failures.append("missing_canonical_proposal_or_tools")
    else:
        if ready or not unavailable:
            failures.append("no_explicit_failure")
    if not any(
        item.get("name") == "find_recipes"
        and item.get("source") == "synthetic:recipes-v1"
        for item in tool_results
    ):
        failures.append("controlled_catalogue_source_missing")
    if ready:
        proposal = ready[0]
        meals = proposal["evaluation"]["candidate"]["meals"]
        original = payload["forwardedProps"]["planning"]
        candidate = proposal["evaluation"]["candidate"]
        if (
            candidate["goal"] != original["goal"]
            or candidate["constraints"] != original["constraints"]
        ):
            failures.append("confirmed_goal_or_constraints_changed")
        if name == "A1" and (
            len(meals) != 9
            or proposal["evaluation"]["candidate"]["goal"]["source"] != "manual"
        ):
            failures.append("manual_goal_or_nine_meals")
        if name == "A3":
            fixed = [
                meal
                for meal in meals
                if meal["day"] == "2026-10-01" and meal["slot"] == "breakfast"
            ]
            if (
                len(fixed) != 1
                or fixed[0]["kind"] != "external"
                or not fixed[0]["locked"]
            ):
                failures.append("fixed_external_changed")
            if (
                len(fixed) == 1
                and fixed[0]["external"]["nutrients"]["protein"]["amount"] is not None
            ):
                failures.append("unknown_protein_invented")
            if any(
                item["day"] == "2026-10-01" and item["slot"] == "breakfast"
                for item in proposal["evaluation"]["prep"]["destinations"]
            ):
                failures.append("external_entered_prep")
            if any(
                item["name"] == "合成外食早餐"
                for item in proposal["evaluation"]["shopping"]["items"]
            ):
                failures.append("external_entered_shopping")
        if name == "A5":
            diff = proposal["diff"]
            if (
                len(diff) != 1
                or diff[0]["after"]["recipeId"] != "tofu-rice"
                or proposal["scope"] != [{"day": "2026-10-02", "slot": "lunch"}]
            ):
                failures.append("scope_or_replacement_changed")
            base_meals = original["base"]["candidate"]["meals"]

            def untouched(meal):
                return (meal["day"], meal["slot"]) != ("2026-10-02", "lunch")

            if [meal for meal in meals if untouched(meal)] != [
                meal for meal in base_meals if untouched(meal)
            ]:
                failures.append("outside_scope_changed")
    sources = sorted(
        {
            f"{record['source']}:{record['version']}"
            for proposal in ready
            for meal in proposal["evaluation"]["mealNutrition"]
            for record in meal["nutrients"].values()
        }
    )
    if not set(sources) <= {"synthetic:recipes-v1", "user:user-v1"}:
        failures.append("uncontrolled_nutrient_source")
    if name == "A3" and ready and "user:user-v1" not in sources:
        failures.append("fixed_external_source_missing")
    return {
        "scenario": name,
        "status": response.status_code,
        "elapsedSeconds": round(elapsed, 3),
        "tools": tools,
        "toolArguments": {
            tool_names[call_id]: parse_arguments(value)
            for call_id, value in arguments.items()
        },
        "toolResults": tool_results,
        "nutrientSources": sources,
        "usage": usage,
        "ready": bool(ready),
        "unavailable": unavailable,
        "text": text,
        "failures": failures,
    }


def parse_arguments(value: str):
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return value[:200]


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("scenario", choices=("A1", "A3", "A5", "A10"))
    parser.add_argument("--trial", type=int, required=True)
    args = parser.parse_args()
    if not 1 <= args.trial <= 20:
        parser.error("trial must be between 1 and 20")
    result_path = ROOT / ".artifacts" / f"t12-live-{args.scenario}-{args.trial}.json"
    events_path = result_path.with_suffix(".events")
    if result_path.exists() or events_path.exists():
        parser.error("trial artifact exists; never silently replace live evidence")
    start = time.monotonic()
    payload = scenario(args.scenario)
    with TestClient(create_live_app()) as client:
        response = client.post("/agent", json=payload)
    raw = response.text
    for key in ("CLOUDFLARE_ACCOUNT_ID", "CLOUDFLARE_API_TOKEN"):
        value = os.environ.get(key)
        if value:
            raw = raw.replace(value, "[REDACTED]")
    events_path.write_text(raw)
    result = inspect(args.scenario, response, time.monotonic() - start, payload)
    result_path.write_text(json.dumps(result, ensure_ascii=False, indent=2))
    print(
        json.dumps(
            {
                key: value
                for key, value in result.items()
                if key not in {"text", "toolArguments"}
            },
            ensure_ascii=False,
        )
    )
    if result["failures"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
