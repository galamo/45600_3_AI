const { test } = require("node:test");
const assert = require("node:assert/strict");
const { sum } = require("./sum");

test("sum adds two numbers", () => {
  assert.equal(sum(2, 3), 5);
  assert.equal(sum(0, 0), 0);
  assert.equal(sum(-1, 1), 0);
});
