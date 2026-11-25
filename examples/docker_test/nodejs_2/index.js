const express = require("express");
const { sum } = require("./sum");

const app = express();
const PORT = 3010;

app.get("/health", (_req, res) => {
  const result = sum(2, 3);
  res.json({ status: "ok", sum: result });
});

if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Listening on ${PORT}`);
  });
}

module.exports = app;
