const $ = (selector) => document.querySelector(selector);
let selectedPlayer = null;

async function api(path, options = {}) {
  const response = await fetch(`/api${path}`, { headers: { "Content-Type": "application/json" }, ...options });
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed.");
  return body;
}
function toast(message, error = false) { const el = $("#toast"); el.textContent = message; el.className = `toast show${error ? " error" : ""}`; setTimeout(() => el.className = "toast", 3000); }
function esc(value) { const div = document.createElement("div"); div.textContent = value; return div.innerHTML; }
function renderPlayer(player) {
  selectedPlayer = player;
  $("#profileEmpty").classList.add("hidden"); const card = $("#playerCard"); card.classList.remove("hidden");
  const achievements = player.achievements.length ? player.achievements.map(a => `<span class="chip">${esc(a)}</span>`).join("") : `<span class="chip">No achievements yet</span>`;
  const boost = player.boost ? `<p class="boost-active">⚡ ${esc(player.boost.name)} · ${player.boost.secondsRemaining}s remaining</p>` : "";
  card.innerHTML = `<div class="player-top"><div><h3>${esc(player.username)}</h3><p>${esc(player.playerId)} · LEVEL ${player.level}</p></div><div class="score">${Number(player.highScore).toLocaleString()}<small>HIGH SCORE</small></div></div>${boost}<div class="chips">${achievements}</div><div class="card-actions"><button data-action="edit">Edit profile</button><button data-action="achievement">+ Achievement</button><button data-action="boost">⚡ Boost</button><button class="danger" data-action="delete">Delete</button></div>`;
}
async function loadPlayer(id) { const player = await api(`/players/${encodeURIComponent(id)}`); renderPlayer(player); return player; }
function renderLeaderboard(players) { $("#playerCount").textContent = players.length; $("#topScore").textContent = players.length ? Number(players[0].highScore).toLocaleString() : "—"; $("#leaderboardList").innerHTML = players.length ? players.map((p, i) => `<div class="rank-row" data-id="${esc(p.playerId)}"><div class="rank">0${i + 1}</div><div><div class="rank-name">${esc(p.username)}</div><div class="rank-id">${esc(p.playerId)}</div></div><div class="rank-level">LEVEL ${p.level}</div><div class="rank-score">${Number(p.highScore).toLocaleString()}</div></div>`).join("") : `<p class="empty-state">No players stored yet. Create the first profile.</p>`; }
async function refreshLeaderboard() { try { renderLeaderboard(await api("/leaderboard")); } catch (e) { toast(e.message, true); } }
function resetForm() { $("#playerForm").reset(); $("#editingId").value = ""; $("#playerId").disabled = false; $("#formTitle").textContent = "Add a player"; $("#submitButton").innerHTML = "Store player <b>→</b>"; $("#cancelEdit").classList.add("hidden"); }

$("#playerForm").addEventListener("submit", async (event) => { event.preventDefault(); const editingId = $("#editingId").value; const data = { playerId: $("#playerId").value, username: $("#username").value, level: $("#level").value, highScore: $("#highScore").value, achievements: $("#achievements").value }; try { const player = editingId ? await api(`/players/${editingId}`, { method: "PUT", body: JSON.stringify(data) }) : await api("/players", { method: "POST", body: JSON.stringify(data) }); toast(editingId ? "Profile updated." : "Player stored."); renderPlayer(player); resetForm(); refreshLeaderboard(); } catch (e) { toast(e.message, true); } });
$("#searchButton").addEventListener("click", async () => { const id = $("#searchId").value.trim(); if (!id) return toast("Enter a player ID.", true); try { await loadPlayer(id); } catch (e) { toast(e.message, true); } });
$("#searchId").addEventListener("keydown", (e) => { if (e.key === "Enter") $("#searchButton").click(); });
$("#cancelEdit").addEventListener("click", resetForm); $("#refreshLeaderboard").addEventListener("click", refreshLeaderboard);
$("#playerCard").addEventListener("click", async (event) => { const action = event.target.dataset.action; if (!action || !selectedPlayer) return; if (action === "edit") { $("#editingId").value = selectedPlayer.playerId; $("#playerId").value = selectedPlayer.playerId; $("#playerId").disabled = true; $("#username").value = selectedPlayer.username; $("#level").value = selectedPlayer.level; $("#highScore").value = selectedPlayer.highScore; $("#achievements").value = ""; $("#formTitle").textContent = `Edit ${selectedPlayer.playerId}`; $("#submitButton").innerHTML = "Update player <b>→</b>"; $("#cancelEdit").classList.remove("hidden"); $("#players").scrollIntoView({ behavior: "smooth" }); return; } try { if (action === "delete") { if (!confirm(`Delete ${selectedPlayer.playerId}?`)) return; await api(`/players/${selectedPlayer.playerId}`, { method: "DELETE" }); $("#playerCard").classList.add("hidden"); $("#profileEmpty").classList.remove("hidden"); toast("Player deleted."); } else if (action === "achievement") { const achievement = prompt("New achievement:"); if (!achievement) return; renderPlayer(await api(`/players/${selectedPlayer.playerId}/achievements`, { method: "POST", body: JSON.stringify({ achievement }) })); toast("Achievement added."); } else if (action === "boost") { const boost = prompt("Boost name:", "Speed Boost"); if (!boost) return; renderPlayer(await api(`/players/${selectedPlayer.playerId}/boost`, { method: "POST", body: JSON.stringify({ boost, seconds: 60 }) })); toast("60-second boost activated."); } refreshLeaderboard(); } catch (e) { toast(e.message, true); } });
$("#leaderboardList").addEventListener("click", async (event) => { const row = event.target.closest("[data-id]"); if (!row) return; try { await loadPlayer(row.dataset.id); $("#players").scrollIntoView({ behavior: "smooth" }); } catch (e) { toast(e.message, true); } });
refreshLeaderboard(); setInterval(() => { if (selectedPlayer?.boost) loadPlayer(selectedPlayer.playerId).catch(() => {}); }, 5000);
