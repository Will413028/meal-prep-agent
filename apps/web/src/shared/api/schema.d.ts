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
        /** InputRange */
        InputRange: {
            /** Max */
            max: number;
            /** Min */
            min: number;
        };
        /** Range */
        Range: {
            /** Max */
            max: number;
            /** Min */
            min: number;
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
