# Respawn — Gaming Player Profiles

A responsive Express and Redis player-profile manager. It supports creating, searching, updating, and deleting players; Redis `APPEND` achievements; TTL-based boosts; and a score-sorted leaderboard.

## Run locally

1. Start Redis locally or create a Redis Cloud/Upstash database.
2. Copy `.env.example` to `.env` and set `REDIS_URL` (or set it in your shell).
3. Run `npm install` and then `npm start`.
4. Open `http://localhost:3000`.

## API

- `POST /api/players` — create a profile
- `GET /api/players/:id` — fetch a profile
- `PUT /api/players/:id` — update a profile
- `DELETE /api/players/:id` — delete a profile
- `POST /api/players/:id/achievements` — append an achievement
- `POST /api/players/:id/boost` — add an expiring boost
- `GET /api/leaderboard` — scores in descending order

For Render, create a Redis service separately and add its URL as the `REDIS_URL` environment variable.
