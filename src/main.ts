import "./style.css";

type Player = { id: string; name: string; score: number };
type State = { players: Player[]; step: number; history: Player[][] };

const STORAGE_KEY = "boardgame-counter:v1";
const HISTORY_LIMIT = 100;

function load(): State {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "");
    if (Array.isArray(saved.players)) return { history: [], step: 1, ...saved };
  } catch {
    // Nothing saved yet, or unreadable: start fresh.
  }
  return { players: [], step: 1, history: [] };
}

let state = load();

// Every change goes through here, so undo and persistence can't be forgotten.
function update(players: Player[]) {
  const history = [...state.history, state.players].slice(-HISTORY_LIMIT);
  state = { ...state, players, history };
  save();
  render();
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

const list = document.querySelector<HTMLUListElement>("#players")!;
const undoButton = document.querySelector<HTMLButtonElement>("#undo")!;
const form = document.querySelector<HTMLFormElement>("#add-player")!;

function render() {
  const top = Math.max(...state.players.map((p) => p.score));
  const hasLeader = state.players.some((p) => p.score !== top);

  list.replaceChildren(
    ...state.players.map((p) => {
      const item = document.createElement("li");
      item.classList.toggle("leader", hasLeader && p.score === top);
      item.innerHTML = `
        <button class="remove" type="button">✕</button>
        <span class="name"></span>
        <button class="minus" type="button">−</button>
        <output data-testid="score">${p.score}</output>
        <button class="plus" type="button">+</button>`;
      item.querySelector(".name")!.textContent = p.name;
      item.querySelector(".remove")!.setAttribute("aria-label", `Remove ${p.name}`);
      item.querySelector(".minus")!.setAttribute("aria-label", `Remove points from ${p.name}`);
      item.querySelector(".plus")!.setAttribute("aria-label", `Add points to ${p.name}`);
      item.dataset.id = p.id;
      return item;
    }),
  );

  undoButton.disabled = state.history.length === 0;
  document.querySelector<HTMLInputElement>(`input[name="step"][value="${state.step}"]`)!.checked = true;
}

list.addEventListener("click", (event) => {
  const button = (event.target as HTMLElement).closest("button");
  const id = button?.closest("li")?.dataset.id;
  if (!button || !id) return;

  if (button.classList.contains("remove")) {
    const name = state.players.find((p) => p.id === id)?.name;
    if (confirm(`Remove ${name}?`)) update(state.players.filter((p) => p.id !== id));
    return;
  }
  const delta = button.classList.contains("plus") ? state.step : -state.step;
  update(state.players.map((p) => (p.id === id ? { ...p, score: p.score + delta } : p)));
});

form.addEventListener("submit", (event) => {
  event.preventDefault();
  const input = form.elements.namedItem("name") as HTMLInputElement;
  const name = input.value.trim();
  if (!name) return;
  update([...state.players, { id: crypto.randomUUID(), name, score: 0 }]);
  input.value = "";
  input.focus();
});

document.querySelector(".step")!.addEventListener("change", (event) => {
  state.step = Number((event.target as HTMLInputElement).value);
  save();
});

undoButton.addEventListener("click", () => {
  const previous = state.history.at(-1);
  if (!previous) return;
  state = { ...state, players: previous, history: state.history.slice(0, -1) };
  save();
  render();
});

document.querySelector("#new-game")!.addEventListener("click", () => {
  if (confirm("Start a new game? Scores go back to 0, players stay.")) {
    update(state.players.map((p) => ({ ...p, score: 0 })));
  }
});

render();
