import "./style.css";

type Player = { id: string; name: string };
// Points scored in one round, by player id. A missing id scored 0.
type Round = Record<string, number>;
type Game = { players: Player[]; rounds: Round[] };
type State = Game & { step: number; history: Game[] };

const STORAGE_KEY = "boardgame-counter:v2";
const HISTORY_LIMIT = 100;

function load(): State {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "");
    if (Array.isArray(saved.players) && saved.rounds?.length) return { history: [], step: 1, ...saved };
  } catch {
    // Nothing saved yet, or unreadable: start fresh.
  }
  return { players: [], rounds: [{}], step: 1, history: [] };
}

let state = load();

const points = (round: Round, id: string) => round[id] ?? 0;
const total = (id: string) => state.rounds.reduce((sum, round) => sum + points(round, id), 0);
const current = () => state.rounds[state.rounds.length - 1];

// Every change goes through here, so undo and persistence can't be forgotten.
function update(game: Partial<Game>) {
  const { players, rounds } = state;
  const history = [...state.history, { players, rounds }].slice(-HISTORY_LIMIT);
  state = { ...state, ...game, history };
  save();
  render();
}

function save() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage blocked or full (e.g. private browsing): keep playing, just unsaved.
  }
}

const list = document.querySelector<HTMLUListElement>("#players")!;
const table = document.querySelector<HTMLTableElement>("#rounds")!;
const undoButton = document.querySelector<HTMLButtonElement>("#undo")!;
const form = document.querySelector<HTMLFormElement>("#add-player")!;

const signed = (n: number) => (n < 0 ? `${n}` : `+${n}`);

function cell(tag: "th" | "td", text: string | number) {
  const el = document.createElement(tag);
  el.textContent = String(text);
  return el;
}

function render() {
  const totals = new Map(state.players.map((p) => [p.id, total(p.id)]));
  const top = Math.max(...totals.values());
  const hasLeader = [...totals.values()].some((t) => t !== top);

  document.querySelector("#round-title")!.textContent = `Round ${state.rounds.length}`;

  list.replaceChildren(
    ...state.players.map((p) => {
      const item = document.createElement("li");
      item.classList.toggle("leader", hasLeader && totals.get(p.id) === top);
      item.innerHTML = `
        <button class="remove" type="button">✕</button>
        <span class="name"><span></span><small data-testid="round-score"></small></span>
        <button class="minus" type="button">−</button>
        <output data-testid="score"></output>
        <button class="plus" type="button">+</button>
        <form class="entry">
          <input name="points" type="number" step="1" placeholder="Points" />
          <button type="submit">Add</button>
        </form>`;
      item.querySelector(".name span")!.textContent = p.name;
      item.querySelector("small")!.textContent = signed(points(current(), p.id));
      item.querySelector("output")!.textContent = String(totals.get(p.id));
      item.querySelector(".remove")!.setAttribute("aria-label", `Remove ${p.name}`);
      item.querySelector(".minus")!.setAttribute("aria-label", `Remove points from ${p.name}`);
      item.querySelector(".plus")!.setAttribute("aria-label", `Add points to ${p.name}`);
      item.querySelector("input")!.setAttribute("aria-label", `Points for ${p.name}`);
      item.querySelector(".entry button")!.setAttribute("aria-label", `Add typed points to ${p.name}`);
      item.dataset.id = p.id;
      return item;
    }),
  );

  const head = document.createElement("tr");
  head.append(cell("th", ""), ...state.players.map((p) => cell("th", p.name)));
  const rows = state.rounds.map((round, i) => {
    const row = document.createElement("tr");
    const label = cell("th", `Round ${i + 1}`);
    label.scope = "row";
    row.append(label, ...state.players.map((p) => cell("td", points(round, p.id))));
    row.classList.toggle("current", i === state.rounds.length - 1);
    return row;
  });
  table.replaceChildren(document.createElement("thead"), document.createElement("tbody"));
  table.tHead!.append(head);
  table.tBodies[0].append(...rows);
  table.hidden = state.players.length === 0;

  undoButton.disabled = state.history.length === 0;
  document.querySelector<HTMLInputElement>(`input[name="step"][value="${state.step}"]`)!.checked = true;
}

list.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest("button");
  const id = button?.closest("li")?.dataset.id;
  if (!button || !id) return;

  if (button.classList.contains("remove")) {
    const name = state.players.find((p) => p.id === id)?.name;
    if (confirm(`Remove ${name}?`)) update({ players: state.players.filter((p) => p.id !== id) });
    return;
  }
  if (button.type === "submit") return;
  score(id, button.classList.contains("plus") ? state.step : -state.step);
});

list.addEventListener("submit", (event) => {
  event.preventDefault();
  const entry = event.target as HTMLFormElement;
  const value = Math.trunc(Number((entry.elements.namedItem("points") as HTMLInputElement).value));
  const id = entry.closest("li")?.dataset.id;
  if (id && value) score(id, value);
});

function score(id: string, delta: number) {
  const round = { ...current(), [id]: points(current(), id) + delta };
  update({ rounds: [...state.rounds.slice(0, -1), round] });
}

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = form.elements.namedItem("name") as HTMLInputElement;
  const name = input.value.trim();
  if (!name) return;
  update({ players: [...state.players, { id: crypto.randomUUID(), name }] });
  input.value = "";
  input.focus();
});

document.querySelector(".step")!.addEventListener("change", (event) => {
  state.step = Number((event.target as HTMLInputElement).value);
  save();
});

document.querySelector("#next-round")!.addEventListener("click", () => {
  update({ rounds: [...state.rounds, {}] });
});

undoButton.addEventListener("click", () => {
  const previous = state.history.at(-1);
  if (!previous) return;
  state = { ...state, ...previous, history: state.history.slice(0, -1) };
  save();
  render();
});

document.querySelector("#new-game")!.addEventListener("click", () => {
  if (confirm("Start a new game? Scores go back to round 1, players stay.")) {
    update({ rounds: [{}] });
  }
});

render();
