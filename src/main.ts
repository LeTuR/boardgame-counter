import "./style.css";

type Player = { id: string; name: string };
// Points scored in one round, by player id. A missing id has no score yet.
type Round = Record<string, number>;
type Game = { players: Player[]; rounds: Round[] };
type State = Game & { history: Game[] };

const GAME_KEY = "boardgame-counter:v2";
const ROSTER_KEY = "boardgame-counter:roster";
const HISTORY_LIMIT = 100;

function read<T>(key: string): T | undefined {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "");
  } catch {
    return undefined; // nothing saved yet, unreadable, or storage blocked
  }
}

function write(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage blocked or full (e.g. private browsing): keep playing, just unsaved.
  }
}

function load(): State {
  const saved = read<Game>(GAME_KEY);
  if (Array.isArray(saved?.players) && saved.rounds?.length) {
    return { players: saved.players, rounds: saved.rounds, history: [] };
  }
  return { players: [], rounds: [{}], history: [] };
}

let state = load();
// Everyone ever added, most recent first. Lives outside the game so it
// survives new games and isn't touched by undo.
let roster = read<string[]>(ROSTER_KEY) ?? state.players.map((p) => p.name);

const same = (a: string, b: string) => a.toLocaleLowerCase() === b.toLocaleLowerCase();
const points = (round: Round, id: string) => round[id] ?? 0;
const total = (id: string) => state.rounds.reduce((sum, round) => sum + points(round, id), 0);

// Every game change goes through here, so undo and persistence can't be forgotten.
function update(game: Partial<Game>) {
  const { players, rounds } = state;
  const history = [...state.history, { players, rounds }].slice(-HISTORY_LIMIT);
  state = { ...state, ...game, history };
  save();
}

function save() {
  const { players, rounds } = state;
  write(GAME_KEY, { players, rounds });
  render();
}

function remember(name: string, replacing?: string) {
  roster = [name, ...roster.filter((n) => !same(n, name) && n !== replacing)];
  write(ROSTER_KEY, roster);
}

function forget(name: string) {
  roster = roster.filter((n) => n !== name);
  write(ROSTER_KEY, roster);
}

const $ = <T extends Element>(selector: string) => document.querySelector<T>(selector)!;

function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Partial<HTMLElementTagNameMap[K]> = {},
  ...children: (Node | string)[]
) {
  const node = Object.assign(document.createElement(tag), props);
  node.append(...children);
  return node;
}

// ---- Score sheet ----

const table = $<HTMLTableElement>("#scores");

function render() {
  const { players, rounds } = state;
  const totals = players.map((p) => total(p.id));
  const top = Math.max(...totals);
  const hasLeader = totals.some((t) => t !== top);
  const last = rounds.length - 1;

  const head = el(
    "tr",
    {},
    el("th", { className: "corner" }),
    ...players.map((p, i) =>
      el("th", { scope: "col" }, el("button", { type: "button", className: "player", ariaLabel: `Edit ${p.name}`, onclick: () => openPlayer(i) }, p.name)),
    ),
  );

  const body = rounds.map((round, r) =>
    el(
      "tr",
      { className: r === last ? "current" : "" },
      el("th", { scope: "row" }, `Round ${r + 1}`),
      ...players.map((p, i) => {
        const value = round[p.id];
        return el(
          "td",
          {},
          el(
            "button",
            { type: "button", className: value === undefined ? "blank" : "", ariaLabel: `${p.name}, round ${r + 1}`, onclick: () => openScore(i, r) },
            value === undefined ? "–" : String(value),
          ),
        );
      }),
    ),
  );

  const foot = el(
    "tr",
    {},
    el("th", { scope: "row" }, "Total"),
    ...totals.map((t) => el("td", { className: hasLeader && t === top ? "leader" : "" }, String(t))),
  );

  table.replaceChildren(el("thead", {}, head), el("tbody", {}, ...body), el("tfoot", {}, foot));
  $(".sheet").toggleAttribute("hidden", players.length === 0);
  $("#empty").toggleAttribute("hidden", players.length > 0);
  $<HTMLButtonElement>("#next-round").disabled = players.length === 0;
  $<HTMLButtonElement>("#undo").disabled = state.history.length === 0;
  $<HTMLTableRowElement>("tbody tr:last-child")?.scrollIntoView({ block: "nearest" });
}

document.addEventListener("click", (event) => {
  if ((event.target as Element).closest(".add-player")) openPlayer();
});

$("#next-round").addEventListener("click", () => update({ rounds: [...state.rounds, {}] }));
$("#new-game").addEventListener("click", () => update({ rounds: [{}] }));

$("#undo").addEventListener("click", () => {
  const previous = state.history.at(-1);
  if (!previous) return;
  state = { ...state, ...previous, history: state.history.slice(0, -1) };
  save();
});

// ---- Score dialog ----

const scoreDialog = $<HTMLDialogElement>("#score-dialog");
const scoreInput = scoreDialog.querySelector("input")!;
let scoring = { player: 0, round: 0 };

function openScore(player: number, round: number) {
  scoring = { player, round };
  const p = state.players[player];
  $("#score-title").textContent = `${p.name} · Round ${round + 1}`;
  scoreInput.value = state.rounds[round][p.id]?.toString() ?? "";
  if (!scoreDialog.open) scoreDialog.showModal();
  scoreInput.focus();
  scoreInput.select();
}

scoreDialog.querySelector(".quick")!.addEventListener("click", (event) => {
  const delta = (event.target as HTMLElement).closest("button")?.dataset.delta;
  if (delta) scoreInput.value = String((Number(scoreInput.value) || 0) + Number(delta));
});

scoreDialog.querySelector("form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const action = (event.submitter as HTMLButtonElement | null)?.value ?? "save";
  if (action !== "cancel") setScore(scoreInput.value.trim());

  const next = scoring.player + 1;
  if (action === "next" && next < state.players.length) openScore(next, scoring.round);
  else scoreDialog.close();
});

function setScore(text: string) {
  const id = state.players[scoring.player].id;
  const round = { ...state.rounds[scoring.round] };
  const value = Math.trunc(Number(text));
  if (text === "") delete round[id];
  else if (Number.isFinite(value)) round[id] = value;
  else return;
  if (round[id] === state.rounds[scoring.round][id]) return; // unchanged: no undo step
  update({ rounds: state.rounds.map((r, i) => (i === scoring.round ? round : r)) });
}

// ---- Player dialog ----

const playerDialog = $<HTMLDialogElement>("#player-dialog");
const nameInput = playerDialog.querySelector("input")!;
const errorText = playerDialog.querySelector(".error")!;
const knownList = playerDialog.querySelector(".known ul")!;
let editing: number | undefined;

function openPlayer(index?: number) {
  editing = index;
  const player = index === undefined ? undefined : state.players[index];
  $("#player-title").textContent = player ? "Edit player" : "Add player";
  nameInput.value = player?.name ?? "";
  errorText.textContent = "";
  playerDialog.querySelector<HTMLButtonElement>(".danger")!.hidden = !player;
  renderKnown();
  playerDialog.showModal();
  nameInput.focus();
}

function renderKnown() {
  const available = editing === undefined ? roster.filter((n) => !state.players.some((p) => same(p.name, n))) : [];
  playerDialog.querySelector<HTMLElement>(".known")!.hidden = available.length === 0;
  knownList.replaceChildren(
    ...available.map((name) =>
      el(
        "li",
        {},
        el("button", { type: "button", className: "chip", ariaLabel: `Add ${name}`, onclick: () => addPlayer(name) }, name),
        el("button", { type: "button", className: "forget", ariaLabel: `Forget ${name}`, onclick: () => (forget(name), renderKnown()) }, "×"),
      ),
    ),
  );
}

function addPlayer(name: string) {
  remember(name);
  update({ players: [...state.players, { id: crypto.randomUUID(), name }] });
  playerDialog.close();
}

playerDialog.querySelector("form")!.addEventListener("submit", (event) => {
  event.preventDefault();
  const action = (event.submitter as HTMLButtonElement | null)?.value ?? "save";
  if (action === "cancel") return playerDialog.close();

  if (action === "remove" && editing !== undefined) {
    update({ players: state.players.filter((_, i) => i !== editing) });
    return playerDialog.close();
  }

  const name = nameInput.value.trim();
  const taken = state.players.find((p, i) => i !== editing && same(p.name, name));
  if (!name) errorText.textContent = "Type a name.";
  else if (taken) errorText.textContent = `${taken.name} is already playing.`;
  else if (editing === undefined) addPlayer(name);
  else {
    const old = state.players[editing];
    remember(name, old.name);
    update({ players: state.players.map((p, i) => (i === editing ? { ...p, name } : p)) });
    playerDialog.close();
  }
});

render();
