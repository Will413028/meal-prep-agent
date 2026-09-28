// Generated from contracts/openapi.json. Do not edit.
export interface paths {
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
        /** BuildProposalRequest */
        BuildProposalRequest: {
            base: components["schemas"]["PlanCandidate-Input"] | null;
            constraints: components["schemas"]["PlanningConstraints"];
            context: components["schemas"]["ProposalContext"];
            /**
             * Fixedmeals
             * @default []
             */
            fixedMeals: components["schemas"]["PlannedMeal-Input"][];
            goal: components["schemas"]["ConfirmedGoal-Input"];
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
            evaluation: components["schemas"]["Evaluation"];
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
            /**
             * Violations
             * @default []
             */
            violations: string[];
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
        /** Evaluation */
        Evaluation: {
            candidate: components["schemas"]["PlanCandidate-Output"];
            /** Days */
            days: components["schemas"]["DailySummary"][];
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
            /** Withintarget */
            withinTarget: boolean | null;
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
        /** ValidateProposalRequest */
        ValidateProposalRequest: {
            base: components["schemas"]["PlanCandidate-Input"] | null;
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
                "application/json": components["schemas"]["PlanCandidate-Input"];
            };
        };
        responses: {
            /** @description Successful Response */
            200: {
                headers: {
                    [name: string]: unknown;
                };
                content: {
                    "application/json": components["schemas"]["Evaluation"];
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
