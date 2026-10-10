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
    return send(response, 200, { name: "Muyu Fake API", status: "running", baseUrl: "/api/" });
  }
  if (request.method === "GET" && pathname === "/health") {
    return send(response, 200, { status: "healthy" });
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
