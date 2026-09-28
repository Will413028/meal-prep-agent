import { readFile, writeFile, mkdir } from "node:fs/promises";
import openapiTS, { astToString } from "openapi-typescript";
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import addFormats from "ajv-formats";
import { _ } from "ajv/dist/compile/codegen/index.js";

const input = new URL("../../../contracts/openapi.json", import.meta.url);
const content = "// Generated from contracts/openapi.json. Do not edit.\n" + astToString(await openapiTS(input));
const schema = JSON.parse(await readFile(input, "utf8"));
const ajv = new Ajv2020({ strict: false, coerceTypes: false, allErrors: true, code: { source: true, esm: true, formats: _`formats` } });
addFormats(ajv);
const validate = ajv.compile({ $ref: "#/components/schemas/GoalResult", components: schema.components });
const outputs = {
  "schema.d.ts": content,
  "goal-validator.js": "// Generated from contracts/openapi.json. Do not edit.\n" + standaloneCode(ajv, validate),
  "goal-validator.d.ts": "// Generated. Do not edit.\nexport default function validate(value: unknown): boolean;\n",
};
for (const name of ["Evaluation", "CanonicalProposal", "BuildProposalResult"]) {
  const validator = ajv.compile({ $ref: `#/components/schemas/${name}`, components: schema.components });
  outputs[`${name}-validator.js`] = '// Generated from contracts/openapi.json. Do not edit.\nimport { fullFormats as formats } from "ajv-formats/dist/formats.js";\n' + standaloneCode(ajv, validator);
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
