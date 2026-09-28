import { readFile, writeFile, mkdir } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import addFormats from "ajv-formats";
import { build } from "esbuild";
import { fileURLToPath } from "node:url";

const webRoot = fileURLToPath(new URL("../", import.meta.url));
async function standalone(ajv, validator) {
  const result = await build({
    absWorkingDir: webRoot,
    stdin: {contents:standaloneCode(ajv,validator),resolveDir:webRoot,sourcefile:"generated-validator.js"},
    bundle:true,format:"esm",platform:"browser",write:false,minify:true,legalComments:"none",
    banner:{js:"// Generated from contracts/openapi.json. Do not edit."},
  });
  return result.outputFiles[0].text;
}

const input = new URL("../../../contracts/openapi.json", import.meta.url);
const content = "// Generated from contracts/openapi.json. Do not edit.\n" + astToString(await openapiTS(input));
const schema = JSON.parse(await readFile(input, "utf8"));
const ajv = new Ajv2020({ strict: false, coerceTypes: false, allErrors: true, code: { source: true, esm: true } });
addFormats(ajv);
const validate = ajv.compile({ $ref: "#/components/schemas/GoalResult", components: schema.components });
const outputs = {
  "schema.d.ts": content,
  "goal-validator.js": await standalone(ajv, validate),
  "goal-validator.d.ts": "// Generated. Do not edit.\nexport default function validate(value: unknown): boolean;\n",
};
const validators = {
  Evaluation: schema.paths["/api/v1/plans/evaluate"].post.responses["200"].content["application/json"].schema,
  CanonicalProposal: schema.paths["/api/v1/proposals/validate"].post.responses["200"].content["application/json"].schema,
  BuildProposalResult: schema.paths["/api/v1/proposals/build"].post.responses["200"].content["application/json"].schema,
  SessionState: schema.paths["/api/plan"].get.responses["200"].content["application/json"].schema,
  PlanActionRequest: schema.paths["/api/plan/actions"].post.requestBody.content["application/json"].schema,
  SessionInit: schema.paths["/api/session"].post.requestBody.content["application/json"].schema,
  PreviewRequest: schema.paths["/api/plan/preview"].post.requestBody.content["application/json"].schema,
  RecipeCatalog: schema.paths["/api/v1/recipes"].get.responses["200"].content["application/json"].schema,
};
for (const [name, modelSchema] of Object.entries(validators)) {
  const validator = ajv.compile({ ...modelSchema, components: schema.components });
  outputs[`${name}-validator.js`] = await standalone(ajv, validator);
  outputs[`${name}-validator.d.ts`] = "// Generated. Do not edit.\nexport default function validate(value: unknown): boolean;\n";
}
for (const [filename, generated] of Object.entries(outputs)) {
  const output = new URL(`../src/shared/api/${filename}`, import.meta.url);
  if (process.argv.includes("--check")) {
    if (await readFile(output, "utf8").catch(() => "") !== generated) {
      throw new Error(`${filename} contract drift: regenerate contracts`);
    }
  } else {
    await mkdir(new URL("../src/shared/api/", import.meta.url), { recursive: true });
    await writeFile(output, generated);
  }
}
