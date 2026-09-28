// Generated from contracts/openapi.json. Do not edit.
export interface paths {
    "/agent": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Run */
        post: operations["run_agent_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/agent": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Agent Contract */
        post: operations["agent_contract_api_agent_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/plan": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Plan Read Contract */
        get: operations["plan_read_contract_api_plan_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/plan/actions": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Plan Action Contract */
        post: operations["plan_action_contract_api_plan_actions_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/plan/preview": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Preview Contract */
        post: operations["preview_contract_api_plan_preview_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/session": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Session Create Contract */
        post: operations["session_create_contract_api_session_post"];
        /** Session Clear Contract */
        delete: operations["session_clear_contract_api_session_delete"];
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/goals/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Validate */
        post: operations["validate_api_v1_goals_validate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/plans/evaluate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Evaluate Plan */
        post: operations["evaluate_plan_api_v1_plans_evaluate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/proposals/build": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Build */
        post: operations["build_api_v1_proposals_build_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/proposals/validate": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        get?: never;
        put?: never;
        /** Validate */
        post: operations["validate_api_v1_proposals_validate_post"];
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/recipes": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Recipes */
        get: operations["recipes_api_v1_recipes_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/api/v1/runtime": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Runtime */
        get: operations["runtime_api_v1_runtime_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
    "/health": {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        /** Health */
        get: operations["health_health_get"];
        put?: never;
        post?: never;
        delete?: never;
        options?: never;
        head?: never;
        patch?: never;
        trace?: never;
    };
}
export type webhooks = Record<string, never>;
export interface components {
    schemas: {
        /** AdoptAction */
        AdoptAction: {
            candidate: components["schemas"]["PlanCandidate-Input"];
            /**
             * Runid
             * Format: uuid
             */
            runId: string;
            /** Scope */
            scope: components["schemas"]["MealKey"][];
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "adopt";
        };
        /** AgentForwardedProps */
        AgentForwardedProps: {
            /**
             * Mode
             * @default fixture
             * @enum {string}
             */
            mode: "fixture" | "live";
            planning: components["schemas"]["PreviewRequest"];
        };
        /** AgentMessage */
        AgentMessage: {
            /** Content */
            content: string;
            /** Id */
            id: string;
            /**
             * Role
             * @enum {string}
             */
            role: "user" | "assistant";
        };
        /** AgentRunRequest */
        AgentRunRequest: {
            /** Context */
            context: unknown[];
            forwardedProps: components["schemas"]["AgentForwardedProps"];
            /** Messages */
            messages: components["schemas"]["AgentMessage"][];
            /**
             * Protocolversion
             * @constant
             */
            protocolVersion: "1.0";
            /**
             * Runid
             * Format: uuid
             */
            runId: string;
            /** State */
            state: {
                [key: string]: unknown;
            };
            /**
             * Threadid
             * Format: uuid
             */
            threadId: string;
            /** Tools */
            tools: unknown[];
        };
        /** BuildProposalRequest */
        BuildProposalRequest: {
            base: components["schemas"]["Evaluation-Input"] | null;
            constraints: components["schemas"]["PlanningConstraints"];
            context: components["schemas"]["ProposalContext"];
            /**
             * Fixedmeals
             * @default []
             */
            fixedMeals: components["schemas"]["PlannedMeal-Input"][];
            goal: components["schemas"]["ConfirmedGoal-Input"];
            /** Pantry */
            pantry?: components["schemas"]["PantryItem"][] | null;
            /** Replacements */
            replacements?: {
                [key: string]: string;
            };
            /**
             * Searchbudget
             * @default 20000
             */
            searchBudget: number;
        };
        /** BuildProposalResult */
        BuildProposalResult: {
            /** Examined */
            examined: number;
            proposal: components["schemas"]["CanonicalProposal"] | null;
            /** Reason */
            reason: string | null;
            /**
             * Status
             * @enum {string}
             */
            status: "ready" | "not_found";
        };
        /** CanonicalProposal */
        CanonicalProposal: {
            /** Baserevision */
            baseRevision: number;
            /** Diff */
            diff: components["schemas"]["MealDiff"][];
            evaluation: components["schemas"]["Evaluation-Output"];
            /**
             * Planid
             * Format: uuid
             */
            planId: string;
            /** Prepdiff */
            prepDiff: components["schemas"]["PrepDiff"][];
            /**
             * Runid
             * Format: uuid
             */
            runId: string;
            /** Scope */
            scope: components["schemas"]["MealKey"][];
            /**
             * Sessiongeneration
             * Format: uuid
             */
            sessionGeneration: string;
            /** Shoppingdiff */
            shoppingDiff: components["schemas"]["ShoppingDiff"][];
            /**
             * Violations
             * @default []
             */
            violations: string[];
        };
        /** ChecksAction */
        ChecksAction: {
            /** Checked */
            checked: boolean;
            /**
             * Collection
             * @enum {string}
             */
            collection: "shopping" | "prep";
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "checks";
        };
        /** ClearedSession */
        ClearedSession: {
            /**
             * Cleared
             * @constant
             */
            cleared: true;
        };
        /** ConfirmedGoal */
        "ConfirmedGoal-Input": {
            /**
             * Confirmedat
             * Format: date-time
             */
            confirmedAt: string;
            /**
             * Intent
             * @enum {string}
             */
            intent: "maintain" | "lose" | "gain";
            /**
             * Policyversion
             * @default nutrition-v1
             * @constant
             */
            policyVersion: "nutrition-v1";
            ranges: components["schemas"]["GoalRanges"];
            /** References */
            references: string[];
            requested: components["schemas"]["GoalValues"];
            /**
             * Schemaversion
             * @default 1
             * @constant
             */
            schemaVersion: 1;
            /**
             * Source
             * @enum {string}
             */
            source: "manual" | "estimated" | "user_adjusted";
        };
        /** ConfirmedGoal */
        "ConfirmedGoal-Output": {
            /**
             * Confirmedat
             * Format: date-time
             */
            confirmedAt: string;
            /**
             * Intent
             * @enum {string}
             */
            intent: "maintain" | "lose" | "gain";
            /**
             * Policyversion
             * @default nutrition-v1
             * @constant
             */
            policyVersion: "nutrition-v1";
            ranges: components["schemas"]["GoalRanges"];
            /** References */
            references: string[];
            requested: components["schemas"]["GoalValues"];
            /**
             * Schemaversion
             * @default 1
             * @constant
             */
            schemaVersion: 1;
            /**
             * Source
             * @enum {string}
             */
            source: "manual" | "estimated" | "user_adjusted";
        };
        /** DailySummary */
        DailySummary: {
            /** Coverage */
            coverage: string[];
            /**
             * Day
             * Format: date
             */
            day: string;
            /** Fullday */
            fullDay: boolean;
            /** Nutrients */
            nutrients: {
                [key: string]: components["schemas"]["NutrientSummary"];
            };
            /** Withintargets */
            withinTargets: boolean | null;
        };
        /** EvaluatePlanRequest */
        EvaluatePlanRequest: {
            base?: components["schemas"]["Evaluation-Input"] | null;
            candidate: components["schemas"]["PlanCandidate-Input"];
        };
        /** Evaluation */
        "Evaluation-Input": {
            candidate: components["schemas"]["PlanCandidate-Input"];
            /** Days */
            days: components["schemas"]["DailySummary"][];
            /** Mealnutrition */
            mealNutrition: components["schemas"]["MealSummary"][];
            prep: components["schemas"]["PrepPlan-Input"];
            shopping: components["schemas"]["ShoppingList"];
            /** Warnings */
            warnings: string[];
        };
        /** Evaluation */
        "Evaluation-Output": {
            candidate: components["schemas"]["PlanCandidate-Output"];
            /** Days */
            days: components["schemas"]["DailySummary"][];
            /** Mealnutrition */
            mealNutrition: components["schemas"]["MealSummary"][];
            prep: components["schemas"]["PrepPlan-Output"];
            shopping: components["schemas"]["ShoppingList"];
            /** Warnings */
            warnings: string[];
        };
        /** ExternalMeal */
        ExternalMeal: {
            /** Basisquantity */
            basisQuantity: number;
            /**
             * Basisunit
             * @enum {string}
             */
            basisUnit: "serving" | "g" | "ml" | "piece";
            /**
             * Ingredientsknown
             * @default false
             * @constant
             */
            ingredientsKnown: false;
            /** Name */
            name: string;
            /** Nutrients */
            nutrients: {
                [key: string]: components["schemas"]["NutrientRecord"];
            };
        };
        /** GoalRanges */
        GoalRanges: {
            carbs: components["schemas"]["Range"] | null;
            fat: components["schemas"]["Range"] | null;
            kcal: components["schemas"]["Range"];
            protein: components["schemas"]["Range"];
        };
        /** GoalRequest */
        GoalRequest: {
            /**
             * Carbs
             * @description Daily carbohydrates in grams
             */
            carbs?: number | components["schemas"]["InputRange"] | null;
            /**
             * Fat
             * @description Daily fat in grams
             */
            fat?: number | components["schemas"]["InputRange"] | null;
            /**
             * Kcal
             * @description Daily energy in kcal
             */
            kcal: number | components["schemas"]["InputRange"];
            /**
             * Protein
             * @description Daily protein in grams
             */
            protein: number | components["schemas"]["InputRange"];
            /**
             * Schemaversion
             * @constant
             */
            schemaVersion: 1;
        };
        /** GoalResult */
        GoalResult: {
            /**
             * Policyversion
             * @default nutrition-v1
             * @constant
             */
            policyVersion: "nutrition-v1";
            ranges: components["schemas"]["GoalRanges"];
            requested: components["schemas"]["GoalValues"];
            /**
             * Schemaversion
             * @default 1
             * @constant
             */
            schemaVersion: 1;
        };
        /** GoalValues */
        GoalValues: {
            /**
             * Carbs
             * @description Daily carbohydrates in grams
             */
            carbs?: number | components["schemas"]["InputRange"] | null;
            /**
             * Fat
             * @description Daily fat in grams
             */
            fat?: number | components["schemas"]["InputRange"] | null;
            /**
             * Kcal
             * @description Daily energy in kcal
             */
            kcal: number | components["schemas"]["InputRange"];
            /**
             * Protein
             * @description Daily protein in grams
             */
            protein: number | components["schemas"]["InputRange"];
        };
        /** HTTPValidationError */
        HTTPValidationError: {
            /** Detail */
            detail?: components["schemas"]["ValidationError"][];
        };
        /** Ingredient */
        Ingredient: {
            /** Foodid */
            foodId: string;
            /** Increment */
            increment: number;
            /** Name */
            name: string;
            /** Quantity */
            quantity: number;
            /** Specification */
            specification: string;
            /**
             * State
             * @enum {string}
             */
            state: "raw" | "cooked" | "ready";
            /**
             * Unit
             * @enum {string}
             */
            unit: "g" | "ml" | "piece";
        };
        /** InputRange */
        InputRange: {
            /** Max */
            max: number;
            /** Min */
            min: number;
        };
        /** LocksAction */
        LocksAction: {
            /**
             * Day
             * Format: date
             */
            day: string;
            /** Locked */
            locked: boolean;
            /**
             * Slot
             * @enum {string}
             */
            slot: "breakfast" | "lunch" | "dinner" | "snack";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "locks";
        };
        /** MealDiff */
        MealDiff: {
            after: components["schemas"]["PlannedMeal-Output"] | null;
            before: components["schemas"]["PlannedMeal-Output"] | null;
            key: components["schemas"]["MealKey"];
        };
        /** MealKey */
        MealKey: {
            /**
             * Day
             * Format: date
             */
            day: string;
            /**
             * Slot
             * @enum {string}
             */
            slot: "breakfast" | "lunch" | "dinner" | "snack";
        };
        /** MealSummary */
        MealSummary: {
            /**
             * Day
             * Format: date
             */
            day: string;
            /** Nutrients */
            nutrients: {
                [key: string]: components["schemas"]["NutrientRecord"];
            };
            /**
             * Slot
             * @enum {string}
             */
            slot: "breakfast" | "lunch" | "dinner" | "snack";
        };
        /** NutrientRecord */
        NutrientRecord: {
            /** Amount */
            amount: number | null;
            /**
             * Source
             * @enum {string}
             */
            source: "synthetic" | "user";
            /** Version */
            version: string;
        };
        /** NutrientSummary */
        NutrientSummary: {
            /** Complete */
            complete: boolean;
            /** Known */
            known: number;
            /** Missing */
            missing: string[];
            /** Targetdifference */
            targetDifference: number | null;
            /** Withintarget */
            withinTarget: boolean | null;
        };
        /** PantryItem */
        PantryItem: {
            /** Confirmed */
            confirmed: boolean;
            /** Foodid */
            foodId: string;
            /** Name */
            name: string;
            /** Quantity */
            quantity: number | null;
            /** Specification */
            specification: string;
            /**
             * State
             * @enum {string}
             */
            state: "raw" | "cooked" | "ready";
            /**
             * Unit
             * @enum {string}
             */
            unit: "g" | "kg" | "ml" | "l" | "piece";
        };
        /** PlanActionRequest */
        PlanActionRequest: {
            /** Action */
            action: components["schemas"]["AdoptAction"] | components["schemas"]["PortionAction"] | components["schemas"]["LocksAction"] | components["schemas"]["ChecksAction"] | components["schemas"]["UndoAction"];
            /** Baserevision */
            baseRevision: number;
            /**
             * Operationid
             * Format: uuid
             */
            operationId: string;
            /**
             * Planid
             * Format: uuid
             */
            planId: string;
            /**
             * Schemaversion
             * @constant
             */
            schemaVersion: 1;
            /**
             * Sessiongeneration
             * Format: uuid
             */
            sessionGeneration: string;
        };
        /** PlanCandidate */
        "PlanCandidate-Input": {
            /**
             * Calculationversion
             * @default calculation-v1
             * @constant
             */
            calculationVersion: "calculation-v1";
            /**
             * Catalogversion
             * @default recipes-v1
             * @constant
             */
            catalogVersion: "recipes-v1";
            constraints: components["schemas"]["PlanningConstraints"];
            goal: components["schemas"]["ConfirmedGoal-Input"];
            /** Meals */
            meals: components["schemas"]["PlannedMeal-Input"][];
            /**
             * Nutritionpolicyversion
             * @default nutrition-v1
             * @constant
             */
            nutritionPolicyVersion: "nutrition-v1";
            /**
             * Pantry
             * @default []
             */
            pantry: components["schemas"]["PantryItem"][];
            /**
             * Schemaversion
             * @default 1
             * @constant
             */
            schemaVersion: 1;
        };
        /** PlanCandidate */
        "PlanCandidate-Output": {
            /**
             * Calculationversion
             * @default calculation-v1
             * @constant
             */
            calculationVersion: "calculation-v1";
            /**
             * Catalogversion
             * @default recipes-v1
             * @constant
             */
            catalogVersion: "recipes-v1";
            constraints: components["schemas"]["PlanningConstraints"];
            goal: components["schemas"]["ConfirmedGoal-Output"];
            /** Meals */
            meals: components["schemas"]["PlannedMeal-Output"][];
            /**
             * Nutritionpolicyversion
             * @default nutrition-v1
             * @constant
             */
            nutritionPolicyVersion: "nutrition-v1";
            /**
             * Pantry
             * @default []
             */
            pantry: components["schemas"]["PantryItem"][];
            /**
             * Schemaversion
             * @default 1
             * @constant
             */
            schemaVersion: 1;
        };
        /** PlannedMeal */
        "PlannedMeal-Input": {
            /**
             * Day
             * Format: date
             */
            day: string;
            external?: components["schemas"]["ExternalMeal"] | null;
            /**
             * Kind
             * @enum {string}
             */
            kind: "recipe" | "external";
            /**
             * Locked
             * @default false
             */
            locked: boolean;
            /** Quantity */
            quantity: number;
            /** Recipeid */
            recipeId?: string | null;
            recipeSnapshot?: components["schemas"]["Recipe"] | null;
            /**
             * Slot
             * @enum {string}
             */
            slot: "breakfast" | "lunch" | "dinner" | "snack";
        };
        /** PlannedMeal */
        "PlannedMeal-Output": {
            /**
             * Day
             * Format: date
             */
            day: string;
            external: components["schemas"]["ExternalMeal"] | null;
            /**
             * Kind
             * @enum {string}
             */
            kind: "recipe" | "external";
            /**
             * Locked
             * @default false
             */
            locked: boolean;
            /** Quantity */
            quantity: number;
            /** Recipeid */
            recipeId: string | null;
            recipeSnapshot: components["schemas"]["Recipe"] | null;
            /**
             * Slot
             * @enum {string}
             */
            slot: "breakfast" | "lunch" | "dinner" | "snack";
        };
        /** PlanningConstraints */
        PlanningConstraints: {
            /**
             * Dietarytags
             * @default []
             */
            dietaryTags: string[];
            /** Equipment */
            equipment: string[];
            /**
             * Excludedfoods
             * @default []
             */
            excludedFoods: string[];
            /**
             * Preferredfoods
             * @default []
             */
            preferredFoods: string[];
            /** Slots */
            slots: ("breakfast" | "lunch" | "dinner" | "snack")[];
            /**
             * Startdate
             * Format: date
             */
            startDate: string;
            /**
             * Timeishard
             * @default false
             */
            timeIsHard: boolean;
            /** Timelimitminutes */
            timeLimitMinutes?: number | null;
        };
        /** PortionAction */
        PortionAction: {
            /**
             * Day
             * Format: date
             */
            day: string;
            /** Quantity */
            quantity: number;
            /**
             * Slot
             * @enum {string}
             */
            slot: "breakfast" | "lunch" | "dinner" | "snack";
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "portion";
        };
        /** PortionDestination */
        PortionDestination: {
            /**
             * Day
             * Format: date
             */
            day: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Quantity */
            quantity: number;
            /** Recipeid */
            recipeId: string;
            /** Reheating */
            reheating: string | null;
            /**
             * Slot
             * @enum {string}
             */
            slot: "breakfast" | "lunch" | "dinner" | "snack";
            /** Storage */
            storage: string | null;
            /**
             * Unit
             * @enum {string}
             */
            unit: "serving" | "g" | "ml" | "piece";
        };
        /** PrepDiff */
        PrepDiff: {
            after: components["schemas"]["PrepStep"] | null;
            before: components["schemas"]["PrepStep"] | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
        };
        /** PrepPlan */
        "PrepPlan-Input": {
            /** Destinations */
            destinations: components["schemas"]["PortionDestination"][];
            /**
             * Sourcelabel
             * @default 合成示範流程；時間為估計，非食品安全指引
             * @constant
             */
            sourceLabel: "合成示範流程；時間為估計，非食品安全指引";
            /** Steps */
            steps: components["schemas"]["PrepStep"][];
            /** Totalminutes */
            totalMinutes: number;
        };
        /** PrepPlan */
        "PrepPlan-Output": {
            /** Destinations */
            destinations: components["schemas"]["PortionDestination"][];
            /**
             * Sourcelabel
             * @default 合成示範流程；時間為估計，非食品安全指引
             * @constant
             */
            sourceLabel: "合成示範流程；時間為估計，非食品安全指引";
            /** Steps */
            steps: components["schemas"]["PrepStep"][];
            /** Totalminutes */
            totalMinutes: number;
        };
        /** PrepStep */
        PrepStep: {
            /** Checked */
            checked: boolean;
            /** Dependson */
            dependsOn: string[];
            /** Description */
            description: string;
            /**
             * Destinationid
             * Format: uuid
             */
            destinationId: string;
            /** Endminute */
            endMinute: number;
            /** Equipment */
            equipment: string | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Recipestepid */
            recipeStepId: string;
            /** Startminute */
            startMinute: number;
        };
        /** PreviewRequest */
        PreviewRequest: {
            constraints: components["schemas"]["PlanningConstraints"];
            context: components["schemas"]["ProposalContext"];
            /**
             * Fixedmeals
             * @default []
             */
            fixedMeals: components["schemas"]["PlannedMeal-Input"][];
            goal: components["schemas"]["ConfirmedGoal-Input"];
            /** Pantry */
            pantry?: components["schemas"]["PantryItem"][] | null;
            /** Replacements */
            replacements?: {
                [key: string]: string;
            };
            /**
             * Schemaversion
             * @constant
             */
            schemaVersion: 1;
            /**
             * Searchbudget
             * @default 20000
             */
            searchBudget: number;
        };
        /** ProposalContext */
        ProposalContext: {
            /** Baserevision */
            baseRevision: number;
            /**
             * Planid
             * Format: uuid
             */
            planId: string;
            /**
             * Runid
             * Format: uuid
             */
            runId: string;
            /** Scope */
            scope: components["schemas"]["MealKey"][];
            /**
             * Sessiongeneration
             * Format: uuid
             */
            sessionGeneration: string;
        };
        /** Range */
        Range: {
            /** Max */
            max: number;
            /** Min */
            min: number;
        };
        /** Recipe */
        Recipe: {
            /** Basisquantity */
            basisQuantity: number;
            /**
             * Basisunit
             * @enum {string}
             */
            basisUnit: "serving" | "g" | "ml" | "piece";
            /** Cost */
            cost: number | null;
            /** Dietarytags */
            dietaryTags: string[];
            /** Equipment */
            equipment: string[];
            /** Id */
            id: string;
            /** Ingredients */
            ingredients: components["schemas"]["Ingredient"][];
            /** Mealslots */
            mealSlots: ("breakfast" | "lunch" | "dinner" | "snack")[];
            /** Name */
            name: string;
            /** Nutrients */
            nutrients: {
                [key: string]: components["schemas"]["NutrientRecord"];
            };
            /** Portionincrement */
            portionIncrement: number;
            /** Portionmaximum */
            portionMaximum: number;
            /** Portionminimum */
            portionMinimum: number;
            /** Reheating */
            reheating: string | null;
            /**
             * Sourcelabel
             * @constant
             */
            sourceLabel: "合成展示食譜，營養與成本非實測";
            /** Steps */
            steps: components["schemas"]["RecipeStep"][];
            /** Storage */
            storage: string | null;
        };
        /** RecipeStep */
        RecipeStep: {
            /** Dependson */
            dependsOn: string[];
            /** Description */
            description: string;
            /** Equipment */
            equipment: string | null;
            /** Id */
            id: string;
            /** Minutes */
            minutes: number;
        };
        /** RuntimeStatus */
        RuntimeStatus: {
            /** Liveavailable */
            liveAvailable: boolean;
        };
        /** SessionInit */
        SessionInit: {
            /**
             * Schemaversion
             * @constant
             */
            schemaVersion: 1;
        };
        /** SessionState */
        SessionState: {
            /** Canundo */
            canUndo: boolean;
            /** Csrftoken */
            csrfToken: string;
            current: components["schemas"]["Evaluation-Output"] | null;
            /**
             * Expiresat
             * Format: date-time
             */
            expiresAt: string;
            /** Lastoperationid */
            lastOperationId: string | null;
            /**
             * Planid
             * Format: uuid
             */
            planId: string;
            /** Revision */
            revision: number;
            /**
             * Schemaversion
             * @constant
             */
            schemaVersion: 1;
            /**
             * Sessiongeneration
             * Format: uuid
             */
            sessionGeneration: string;
        };
        /** ShoppingDiff */
        ShoppingDiff: {
            after: components["schemas"]["ShoppingItem"] | null;
            before: components["schemas"]["ShoppingItem"] | null;
            /**
             * Id
             * Format: uuid
             */
            id: string;
        };
        /** ShoppingItem */
        ShoppingItem: {
            /** Checked */
            checked: boolean;
            /** Foodid */
            foodId: string;
            /**
             * Id
             * Format: uuid
             */
            id: string;
            /** Name */
            name: string;
            /** Pantryused */
            pantryUsed: number;
            /** Required */
            required: number;
            /** Requiresreconfirmation */
            requiresReconfirmation: boolean;
            /** Specification */
            specification: string;
            /**
             * State
             * @enum {string}
             */
            state: "raw" | "cooked" | "ready";
            /** Tobuy */
            toBuy: number;
            /**
             * Unit
             * @enum {string}
             */
            unit: "g" | "kg" | "ml" | "l" | "piece";
        };
        /** ShoppingList */
        ShoppingList: {
            /** Items */
            items: components["schemas"]["ShoppingItem"][];
            /** Warnings */
            warnings: string[];
        };
        /** UndoAction */
        UndoAction: {
            /**
             * @description discriminator enum property added by openapi-typescript
             * @enum {string}
             */
            type: "undo";
        };
        /** ValidateProposalRequest */
        ValidateProposalRequest: {
            base: components["schemas"]["Evaluation-Input"] | null;
            candidate: components["schemas"]["PlanCandidate-Input"];
            context: components["schemas"]["ProposalContext"];
        };
        /** ValidationError */
        ValidationError: {
            /** Context */
            ctx?: Record<string, never>;
            /** Input */
            input?: unknown;
            /** Location */
            loc: (string | number)[];
            /** Message */
            msg: string;
            /** Error Type */
            type: string;
        };
    };
    responses: never;
    parameters: never;
    requestBodies: never;
    headers: never;
    pathItems: never;
}
export type $defs = Record<string, never>;
export interface operations {
    run_agent_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": unknown;
                };
            };
        };
    };
    agent_contract_api_agent_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["AgentRunRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "text/event-stream": unknown;
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    plan_read_contract_api_plan_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionState"];
                };
            };
        };
    };
    plan_action_contract_api_plan_actions_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PlanActionRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionState"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    preview_contract_api_plan_preview_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["PreviewRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuildProposalResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    session_create_contract_api_session_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["SessionInit"];
            };
        };
        responses: {
            /** @description Successful Response */
            201: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["SessionState"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    session_clear_contract_api_session_delete: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["ClearedSession"];
                };
            };
        };
    };
    validate_api_v1_goals_validate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["GoalRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["GoalResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    evaluate_plan_api_v1_plans_evaluate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["EvaluatePlanRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Evaluation-Output"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    build_api_v1_proposals_build_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["BuildProposalRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["BuildProposalResult"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    validate_api_v1_proposals_validate_post: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody: {
            content: {
                "application/json": components["schemas"]["ValidateProposalRequest"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["CanonicalProposal"];
                };
            };
            /** @description Validation Error */
            422: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["HTTPValidationError"];
                };
            };
        };
    };
    recipes_api_v1_recipes_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Recipe"][];
                };
            };
        };
    };
    runtime_api_v1_runtime_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["RuntimeStatus"];
                };
            };
        };
    };
    health_health_get: {
        parameters: {
            query?: never;
            header?: never;
            path?: never;
            cookie?: never;
        };
        requestBody?: never;
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": {
                        [key: string]: string;
                    };
                };
            };
        };
    };
}
