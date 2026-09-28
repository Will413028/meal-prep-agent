import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import Home from "./page";

test("fixture mode is explicitly labelled", () => {
  expect(renderToStaticMarkup(<Home />)).toContain("合成資料展示");
});
