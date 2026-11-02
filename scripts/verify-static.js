const fs = require("node:fs");
const path = require("node:path");

const rootDir = path.resolve(__dirname, "..");
const mirroredFiles = ["index.html", "styles.css", "app.js", "document-model.js", "draft-store.js", "workflow.js", "workflow.css"];

for (const file of mirroredFiles) {
  const root = fs.readFileSync(path.join(rootDir, file));
  const publicCopy = fs.readFileSync(path.join(rootDir, "public", file));
  if (!root.equals(publicCopy)) {
    throw new Error(`${file} and public/${file} are out of sync`);
  }
}

console.log("Static file mirrors are in sync");
