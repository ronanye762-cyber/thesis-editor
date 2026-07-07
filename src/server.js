const http = require("node:http");
const appConfig = require("./config");
const { route } = require("./router");
const { ensureDataStore } = require("./storage");

ensureDataStore();

const server = http.createServer((req, res) => {
  route(req, res);
});

function onListening() {
  const location = appConfig.host ? `http://${appConfig.host}:${appConfig.port}` : `port ${appConfig.port}`;
  console.log(`Thesis editor backend listening on ${location}`);
  console.log(`Serving static frontend from ${appConfig.publicDir}`);
}

if (appConfig.host) {
  server.listen(appConfig.port, appConfig.host, onListening);
} else {
  server.listen(appConfig.port, onListening);
}

server.on("error", (error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});

function shutdown(signal) {
  console.log(`Received ${signal}, shutting down...`);
  server.close(() => process.exit(0));
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
