require("dotenv").config();
const express = require("express");
const Redis = require("ioredis");

const app = express();
const port = process.env.PORT || 3000;
const redisUrl = process.env.REDIS_URL;
let redis = null;
let redisAvailable = false;

if (redisUrl) {
  redis = new Redis(redisUrl, {
    lazyConnect: true,
    connectTimeout: 10000,
    maxRetriesPerRequest: 1,
    // Do not retry forever when a hosted Redis instance is unavailable.
    retryStrategy: () => null,
    enableReadyCheck: true,
    tls: redisUrl.startsWith("rediss://") ? {} : undefined,
  });
  redis.on("ready", () => { redisAvailable = true; console.log("Redis connection established."); });
  redis.on("end", () => { redisAvailable = false; });
  redis.on("error", () => { redisAvailable = false; });
}

const playerKey = (id) => `player:${id}`;
const achievementKey = (id) => `player:${id}:achievements`;
const boostKey = (id) => `player:${id}:boost`;
const leaderboardKey = "leaderboard";

app.use(express.json());
app.use(express.static("public"));

function validatePlayer(body) {
  const playerId = String(body.playerId || "").trim().toUpperCase();
  const username = String(body.username || "").trim();
  const level = Number(body.level);
  const highScore = Number(body.highScore);
  if (!playerId || !username || !Number.isInteger(level) || level < 1 || !Number.isFinite(highScore) || highScore < 0) {
    return null;
  }
  return { playerId, username, level, highScore };
}

async function getPlayer(playerId) {
  const raw = await redis.get(playerKey(playerId));
  if (!raw) return null;
  const player = JSON.parse(raw);
  player.achievements = (await redis.get(achievementKey(playerId)) || "")
    .split("|").filter(Boolean);
  const [boost, boostTtl] = await Promise.all([redis.get(boostKey(playerId)), redis.ttl(boostKey(playerId))]);
  player.boost = boost ? { name: boost, secondsRemaining: Math.max(boostTtl, 0) } : null;
  return player;
}

app.get("/api/health", async (_req, res) => {
  if (!redisAvailable) return res.status(503).json({ status: "degraded", error: "Redis is unavailable. Set REDIS_URL to a hosted Redis connection string." });
  try { await redis.ping(); res.json({ status: "ok" }); }
  catch { res.status(503).json({ status: "degraded", error: "Redis is unavailable. Check REDIS_URL." }); }
});

// The website can still deploy and load without Redis. Data endpoints return a
// clear 503 until a Redis Cloud/Upstash URL is configured in the host dashboard.
app.use("/api", (req, res, next) => {
  if (req.path === "/health") return next();
  if (!redisAvailable) return res.status(503).json({ error: "Database unavailable. Configure REDIS_URL and redeploy." });
  next();
});

app.post("/api/players", async (req, res, next) => {
  try {
    const player = validatePlayer(req.body);
    if (!player) return res.status(400).json({ error: "Provide a player ID, username, level (1+), and non-negative score." });
    const exists = await redis.exists(playerKey(player.playerId));
    if (exists) return res.status(409).json({ error: "That player ID already exists. Use update instead." });
    const achievements = String(req.body.achievements || "").split(",").map((item) => item.trim()).filter(Boolean);
    const pipeline = redis.pipeline();
    pipeline.set(playerKey(player.playerId), JSON.stringify(player));
    if (achievements.length) pipeline.set(achievementKey(player.playerId), achievements.join("|"));
    pipeline.zadd(leaderboardKey, player.highScore, player.playerId);
    await pipeline.exec();
    res.status(201).json(await getPlayer(player.playerId));
  } catch (error) { next(error); }
});

app.get("/api/players/:id", async (req, res, next) => {
  try {
    const player = await getPlayer(req.params.id.toUpperCase());
    if (!player) return res.status(404).json({ error: "Player not found." });
    res.json(player);
  } catch (error) { next(error); }
});

app.put("/api/players/:id", async (req, res, next) => {
  try {
    const id = req.params.id.toUpperCase();
    if (!(await redis.exists(playerKey(id)))) return res.status(404).json({ error: "Player not found." });
    const player = validatePlayer({ ...req.body, playerId: id });
    if (!player) return res.status(400).json({ error: "Provide a username, level (1+), and non-negative score." });
    await redis.multi().set(playerKey(id), JSON.stringify(player)).zadd(leaderboardKey, player.highScore, id).exec();
    res.json(await getPlayer(id));
  } catch (error) { next(error); }
});

app.delete("/api/players/:id", async (req, res, next) => {
  try {
    const id = req.params.id.toUpperCase();
    const removed = await redis.multi().del(playerKey(id), achievementKey(id), boostKey(id)).zrem(leaderboardKey, id).exec();
    if (!removed[0][1]) return res.status(404).json({ error: "Player not found." });
    res.status(204).end();
  } catch (error) { next(error); }
});

app.post("/api/players/:id/achievements", async (req, res, next) => {
  try {
    const id = req.params.id.toUpperCase();
    const achievement = String(req.body.achievement || "").trim();
    if (!(await redis.exists(playerKey(id)))) return res.status(404).json({ error: "Player not found." });
    if (!achievement) return res.status(400).json({ error: "Enter an achievement." });
    const existing = await redis.get(achievementKey(id));
    // Redis APPEND demonstrates string operations while retaining a clean list delimiter.
    await redis.append(achievementKey(id), `${existing ? "|" : ""}${achievement}`);
    res.json(await getPlayer(id));
  } catch (error) { next(error); }
});

app.post("/api/players/:id/boost", async (req, res, next) => {
  try {
    const id = req.params.id.toUpperCase();
    const boost = String(req.body.boost || "").trim();
    const seconds = Math.min(Math.max(Number(req.body.seconds) || 60, 5), 3600);
    if (!(await redis.exists(playerKey(id)))) return res.status(404).json({ error: "Player not found." });
    if (!boost) return res.status(400).json({ error: "Enter a boost name." });
    await redis.set(boostKey(id), boost, "EX", seconds);
    res.json(await getPlayer(id));
  } catch (error) { next(error); }
});

app.get("/api/leaderboard", async (_req, res, next) => {
  try {
    const ranked = await redis.zrevrange(leaderboardKey, 0, 49, "WITHSCORES");
    const players = await Promise.all(ranked.filter((_, index) => index % 2 === 0).map(getPlayer));
    res.json(players.filter(Boolean));
  } catch (error) { next(error); }
});

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(500).json({ error: "Something went wrong. Please try again." });
});

app.listen(port, () => {
  console.log(`Gaming profiles running on port ${port}`);
  if (!redis) {
    console.warn("REDIS_URL is not set. The site is online, but profile APIs are disabled until Redis is configured.");
    return;
  }
  redis.connect().catch(() => console.warn("Redis could not be reached. Profile APIs will return 503 until it is available."));
});
