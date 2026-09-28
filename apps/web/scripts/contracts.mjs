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
const ajv = new Ajv2020({ strict: false, coerceTypes: false, allErrors: false, inlineRefs: false, code: { source: true, esm: true } });
addFormats(ajv);
const outputs = {"schema.d.ts": content};
const validators = {
  goal: {$ref:"#/components/schemas/GoalResult"},
  Evaluation: schema.paths["/api/v1/plans/evaluate"].post.responses["200"].content["application/json"].schema,
  CanonicalProposal: schema.paths["/api/v1/proposals/validate"].post.responses["200"].content["application/json"].schema,
  BuildProposalResult: schema.paths["/api/v1/proposals/build"].post.responses["200"].content["application/json"].schema,
  SessionState: schema.paths["/api/plan"].get.responses["200"].content["application/json"].schema,
  PlanActionRequest: schema.paths["/api/plan/actions"].post.requestBody.content["application/json"].schema,
  SessionInit: schema.paths["/api/session"].post.requestBody.content["application/json"].schema,
  PreviewRequest: schema.paths["/api/plan/preview"].post.requestBody.content["application/json"].schema,
  AgentRunRequest: schema.paths["/api/agent"].post.requestBody.content["application/json"].schema,
  RecipeCatalog: schema.paths["/api/v1/recipes"].get.responses["200"].content["application/json"].schema,
};
// Compile one schema graph so shared contracts are emitted once across all roots.
// The wrappers preserve existing imports; no runtime compiler or coercion is added.
ajv.addSchema({$id:"meal-contract",components:schema.components,definitions:validators});
const exports = Object.fromEntries(Object.keys(validators).map(name=>[name,`meal-contract#/definitions/${name}`]));
outputs["validators.js"] = await standalone(ajv,exports);
outputs["validators.d.ts"] = "// Generated. Do not edit.\n" + Object.keys(validators).map(name=>`export function ${name}(value: unknown): boolean;\n`).join("");
for (const name of Object.keys(validators)) {
  outputs[`${name}-validator.js`] = `// Generated from contracts/openapi.json. Do not edit.\nexport {${name} as default} from "./validators.js";\n`;
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
