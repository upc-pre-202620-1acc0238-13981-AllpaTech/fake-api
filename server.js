"use strict";

const http = require("node:http");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";
const MAX_BODY_SIZE = 20_000_000;
const seedPath = path.join(__dirname, "data", "seed.json");
const runtimePath = path.join(__dirname, "data", "runtime.json");

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadDatabase() {
  const source = fs.existsSync(runtimePath) ? runtimePath : seedPath;
  return JSON.parse(fs.readFileSync(source, "utf8"));
}

let database = loadDatabase();
const sessions = new Map();

function saveDatabase() {
  fs.writeFileSync(runtimePath, JSON.stringify(database, null, 2));
}

function send(response, status, payload) {
  response.writeHead(status, {
    "Content-Type": "application/json; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Access-Control-Allow-Methods": "GET, POST, PUT, OPTIONS",
    "Cache-Control": "no-store"
  });
  response.end(JSON.stringify(payload));
}

function sendHtml(response, status, html) {
  response.writeHead(status, {
    "Content-Type": "text/html; charset=utf-8",
    "Access-Control-Allow-Origin": "*",
    "Cache-Control": "no-store"
  });
  response.end(html);
}

function dashboardHtml() {
  const resources = [
    { href: "/api/users", label: "users", count: database.users.length },
    { href: "/api/plots", label: "plots", count: database.plots.length },
    { href: "/health", label: "health", count: "status" }
  ];
  const resourceLinks = resources
    .map(
      ({ href, label, count }) =>
        `<li><a href="${href}">/${label}</a><span>${count}${typeof count === "number" ? "x" : ""}</span></li>`
    )
    .join("");

  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>Muyu Fake API</title>
  <style>
    :root { color-scheme: light; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #243248; background: #fff; }
    * { box-sizing: border-box; }
    body { margin: 0; min-height: 100vh; }
    header { border-bottom: 1px solid #e5e7eb; }
    nav, main { width: min(1100px, calc(100% - 40px)); margin: 0 auto; }
    nav { min-height: 96px; display: flex; align-items: center; justify-content: space-between; gap: 24px; }
    nav strong { font-size: 28px; color: #245b25; }
    nav div { display: flex; gap: 28px; color: #526176; }
    main { padding: 82px 0; }
    .eyebrow { display: inline-flex; align-items: center; gap: 8px; padding: 8px 12px; border-radius: 999px; background: #ecf7e8; color: #327326; font-weight: 700; }
    h1 { margin: 26px 0 10px; font-size: clamp(40px, 6vw, 64px); font-weight: 500; letter-spacing: -2px; }
    .lead { margin: 0; color: #526176; font-size: 20px; }
    section { margin-top: 62px; }
    h2 { margin: 0 0 22px; font-size: 34px; font-weight: 500; }
    ul { margin: 0; padding: 0; list-style: none; width: min(480px, 100%); }
    li { display: flex; align-items: center; justify-content: space-between; padding: 14px 0; border-bottom: 1px solid #edf0f3; }
    a { color: #397149; font-size: 19px; text-underline-offset: 4px; }
    li span { color: #667085; }
    table { width: 100%; border-collapse: collapse; overflow: hidden; border: 1px solid #e5e7eb; border-radius: 12px; }
    th, td { padding: 14px 16px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f8faf8; color: #33523a; }
    code { padding: 3px 7px; border-radius: 6px; background: #f2f4f7; }
    footer { margin-top: 64px; color: #667085; }
    @media (max-width: 680px) { nav div { display: none; } main { padding-top: 48px; } table { font-size: 13px; } th, td { padding: 10px 8px; } }
  </style>
</head>
<body>
  <header>
    <nav>
      <strong>Muyu Fake API</strong>
      <div><span>Node.js</span><span>Render</span><span>REST API</span></div>
    </nav>
  </header>
  <main>
    <span class="eyebrow">● Service running</span>
    <h1>Congrats!</h1>
    <p class="lead">You're successfully running the Muyu Fake API.</p>

    <section>
      <h2>Resources</h2>
      <ul>${resourceLinks}</ul>
    </section>

    <section>
      <h2>Available endpoints</h2>
      <table>
        <thead><tr><th>Method</th><th>Endpoint</th><th>Description</th></tr></thead>
        <tbody>
          <tr><td><code>GET</code></td><td><a href="/api/users">/api/users</a></td><td>List registered users</td></tr>
          <tr><td><code>POST</code></td><td>/api/users/register</td><td>Register a new user</td></tr>
          <tr><td><code>POST</code></td><td>/api/users/login</td><td>Authenticate a user</td></tr>
          <tr><td><code>GET</code></td><td><a href="/api/plots">/api/plots</a></td><td>List published plots</td></tr>
          <tr><td><code>POST</code></td><td>/api/plots</td><td>Create a plot</td></tr>
          <tr><td><code>PUT</code></td><td>/api/plots/:id</td><td>Update a plot</td></tr>
          <tr><td><code>POST</code></td><td>/api/plots/:id/fund</td><td>Fund a plot</td></tr>
        </tbody>
      </table>
    </section>
    <footer>AllpaTech · Muyu demonstration service</footer>
  </main>
</body>
</html>`;
}

function readJson(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk;
      if (Buffer.byteLength(body) > MAX_BODY_SIZE) {
        reject(new Error("Request body is too large"));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!body) return resolve({});
      try {
        resolve(JSON.parse(body));
      } catch {
        reject(new Error("Invalid JSON body"));
      }
    });
    request.on("error", reject);
  });
}

function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function publicUser(user, token) {
  return {
    token,
    email: user.email,
    firstName: user.firstName,
    lastName: user.lastName,
    role: user.role
  };
}

function currentUser(request) {
  const authorization = request.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  const email = sessions.get(token);
  return database.users.find((user) => user.email === email) || null;
}

function defaultPlot(body, owner) {
  return {
    id: Math.max(0, ...database.plots.map((plot) => Number(plot.id) || 0)) + 1,
    name: String(body.name || "New plot"),
    crop: String(body.crop || ""),
    area: String(body.area || ""),
    harvestDate: String(body.harvestDate || ""),
    place: String(body.place || "Peru"),
    stage: "Available",
    progress: 0,
    status: "available",
    amount: String(body.amount || ""),
    cycle: String(body.cycle || ""),
    milestones: String(body.milestones || ""),
    imageUri: body.imageUri ?? null,
    ownerEmail: owner.email,
    ownerName: `${owner.firstName} ${owner.lastName}`.trim(),
    fundedByEmail: null,
    latitude: body.latitude ?? null,
    longitude: body.longitude ?? null,
    accuracyMeters: body.accuracyMeters ?? null,
    publishedAt: body.publishedAt || new Date().toISOString(),
    milestoneStates: Array.isArray(body.milestoneStates) ? body.milestoneStates : [],
    visitOutcome: "",
    visitDate: ""
  };
}

async function route(request, response) {
  const url = new URL(request.url, `http://${request.headers.host || "localhost"}`);
  const pathname = url.pathname.replace(/\/+$/, "") || "/";

  if (request.method === "OPTIONS") return send(response, 204, {});
  if (request.method === "GET" && pathname === "/") {
    return sendHtml(response, 200, dashboardHtml());
  }
  if (request.method === "GET" && pathname === "/health") {
    return send(response, 200, { status: "healthy" });
  }

  if (request.method === "GET" && pathname === "/api") {
    return send(response, 200, {
      name: "Muyu Fake API",
      status: "running",
      resources: {
        users: "/api/users",
        plots: "/api/plots",
        health: "/health"
      }
    });
  }

  if (request.method === "GET" && pathname === "/api/users") {
    const users = database.users.map(({ password, ...user }) => user);
    return send(response, 200, { users: clone(users) });
  }

  if (request.method === "POST" && pathname === "/api/users/login") {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    const user = database.users.find(
      (candidate) => candidate.email === email && candidate.password === body.password
    );
    if (!user) return send(response, 401, { message: "Invalid email or password" });
    const token = crypto.randomUUID();
    sessions.set(token, user.email);
    return send(response, 200, publicUser(user, token));
  }

  if (request.method === "POST" && pathname === "/api/users/register") {
    const body = await readJson(request);
    const email = normalizeEmail(body.email);
    if (!email || !body.password || database.users.some((user) => user.email === email)) {
      return send(response, 400, { message: "Could not create the account" });
    }
    const names = String(body.name || "New user").trim().split(/\s+/, 2);
    const user = {
      email,
      password: String(body.password),
      firstName: names[0] || "New",
      lastName: names[1] || "",
      role: body.role === "merchant" ? "merchant" : "farmer",
      phone: String(body.phone || ""),
      birthdate: String(body.birthdate || "")
    };
    database.users.push(user);
    saveDatabase();
    const token = crypto.randomUUID();
    sessions.set(token, user.email);
    return send(response, 201, publicUser(user, token));
  }

  if (request.method === "GET" && pathname === "/api/plots") {
    return send(response, 200, { plots: clone(database.plots) });
  }

  if (request.method === "POST" && pathname === "/api/plots") {
    const body = await readJson(request);
    const owner = currentUser(request) || database.users.find((user) => user.role === "farmer");
    const plot = defaultPlot(body, owner);
    database.plots.push(plot);
    saveDatabase();
    return send(response, 201, clone(plot));
  }

  const updateMatch = pathname.match(/^\/api\/plots\/(\d+)$/);
  if (request.method === "PUT" && updateMatch) {
    const id = Number(updateMatch[1]);
    const index = database.plots.findIndex((plot) => plot.id === id);
    if (index < 0) return send(response, 404, { message: "Plot not found" });
    const body = await readJson(request);
    const immutable = ["id", "ownerEmail", "ownerName", "fundedByEmail"];
    const allowed = Object.fromEntries(
      Object.entries(body).filter(([key]) => !immutable.includes(key))
    );
    database.plots[index] = { ...database.plots[index], ...allowed, id };
    saveDatabase();
    return send(response, 200, clone(database.plots[index]));
  }

  const fundMatch = pathname.match(/^\/api\/plots\/(\d+)\/fund$/);
  if (request.method === "POST" && fundMatch) {
    const id = Number(fundMatch[1]);
    const index = database.plots.findIndex((plot) => plot.id === id);
    if (index < 0) return send(response, 404, { message: "Plot not found" });
    const merchant = currentUser(request) || database.users.find((user) => user.role === "merchant");
    database.plots[index] = {
      ...database.plots[index],
      status: "funded",
      stage: "Funded",
      fundedByEmail: merchant.email
    };
    saveDatabase();
    return send(response, 200, clone(database.plots[index]));
  }

  return send(response, 404, { message: "Not found" });
}

const server = http.createServer((request, response) => {
  route(request, response).catch((error) => {
    const status = error.message.includes("JSON") || error.message.includes("large") ? 400 : 500;
    send(response, status, { message: error.message });
  });
});

server.listen(PORT, HOST, () => {
  console.log(`Muyu Fake API listening on http://${HOST}:${PORT}`);
});
