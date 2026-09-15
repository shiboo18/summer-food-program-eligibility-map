import { expect, test } from "vitest";
import { isEven } from "../math.js";

test("when 2 then isEven true", () => {
  const result = isEven(2);
  expect(result).toEqual(true);
});
