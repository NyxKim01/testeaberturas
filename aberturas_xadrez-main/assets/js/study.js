import { OPENINGS, OPENING_FAMILIES, findOpeningById } from "./data/openings.js";

const queryOpening = new URLSearchParams(window.location.search).get("opening");
let selectedOpening = findOpeningById(queryOpening);
let selectedVariation = null;
let activeFamily = "Todas";
let query = "";

const ui = {
  total: document.querySelector("#opening-total"), search: document.querySelector("#opening-search"), filters: document.querySelector("#family-filters"),
  count: document.querySelector("#result-count"), list: document.querySelector("#opening-list"),
  eco: document.querySelector("#detail-eco"), family: document.querySelector("#detail-family"), name: document.querySelector("#detail-name"), description: document.querySelector("#detail-description"), moves: document.querySelector("#detail-moves"),
  white: document.querySelector("#detail-white"), draw: document.querySelector("#detail-draw"), black: document.querySelector("#detail-black"), whiteBar: document.querySelector("#detail-white-bar"), drawBar: document.querySelector("#detail-draw-bar"), blackBar: document.querySelector("#detail-black-bar"),
  sample: document.querySelector("#sample-count"), chart: document.querySelector("#probability-chart"), variations: document.querySelector("#variation-list"), boardLink: document.querySelector("#detail-board-link"),
};

function percent(value) { return `${Math.round(value)}%`; }

function filteredOpenings() {
  const normalized = query.trim().toLocaleLowerCase("pt-BR");
  return OPENINGS.filter((opening) => activeFamily === "Todas" || opening.family === activeFamily)
    .filter((opening) => !normalized || `${opening.name} ${opening.eco} ${opening.family}`.toLocaleLowerCase("pt-BR").includes(normalized));
}

function renderFilters() {
  ui.filters.innerHTML = OPENING_FAMILIES.map((family) => `<button class="filter-pill ${family === activeFamily ? "is-active" : ""}" type="button" data-family="${family}">${family}</button>`).join("");
}

function renderList() {
  const openings = filteredOpenings();
  ui.count.textContent = `${openings.length} ${openings.length === 1 ? "rota" : "rotas"}`;
  ui.list.innerHTML = openings.length ? openings.map((opening, index) => `
    <button class="opening-item ${opening.id === selectedOpening.id ? "is-selected" : ""}" type="button" data-opening="${opening.id}">
      <span class="opening-medallion">${String(index + 1).padStart(2, "0")}</span>
      <span>
        <span class="item-eco">${opening.eco}</span>
        <span class="item-name">${opening.name}</span>
        <span class="item-family">${opening.family}</span>
      </span>
      <span class="item-stats"><span><strong>${opening.stats.white}%</strong>cl.</span><span><strong>${opening.stats.draw}%</strong>emp.</span><span><strong>${opening.stats.black}%</strong>esc.</span></span>
      <span class="item-arrow" aria-hidden="true">›</span>
    </button>`).join("") : '<div class="empty-atlas">Nenhuma corrente encontrada. Tente outro nome ou ECO.</div>';
}

function selectedStats() {
  return selectedVariation ? selectedVariation.stats : selectedOpening.stats;
}

function selectedTrend() {
  if (!selectedVariation) return selectedOpening.trend;
  return selectedOpening.trend.map((value, index, all) => {
    const progress = index / (all.length - 1);
    return value + (selectedVariation.white - value) * progress;
  });
}

function renderChart() {
  const trend = selectedTrend();
  const width = 520; const height = 170;
  const margin = { top: 18, right: 16, bottom: 27, left: 16 };
  const plotWidth = width - margin.left - margin.right;
  const plotHeight = height - margin.top - margin.bottom;
  const x = (index) => margin.left + (index / (trend.length - 1)) * plotWidth;
  const y = (value) => margin.top + (58 - value) / 18 * plotHeight;
  const points = trend.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ");
  const area = `${margin.left},${margin.top + plotHeight} ${points} ${width - margin.right},${margin.top + plotHeight}`;
  const grid = [44, 50, 56].map((value) => `<line class="chart-grid-line" x1="${margin.left}" x2="${width - margin.right}" y1="${y(value)}" y2="${y(value)}"/><text class="chart-label" x="1" y="${y(value) + 3}">${value}%</text>`).join("");
  const dots = trend.map((value, index) => `<circle class="chart-dot" cx="${x(index)}" cy="${y(value)}" r="${index === trend.length - 1 ? 4 : 2.6}"/>`).join("");
  const labels = trend.map((_, index) => index % 2 === 0 || index === trend.length - 1 ? `<text class="chart-label" text-anchor="middle" x="${x(index)}" y="${height - 6}">${index + 1}</text>` : "").join("");
  ui.chart.innerHTML = `<defs><linearGradient id="chart-gradient" x1="0" x2="0" y1="0" y2="1"><stop offset="0%" stop-color="#ff9d8d"/><stop offset="100%" stop-color="#ff9d8d" stop-opacity="0"/></linearGradient></defs>${grid}<polygon class="chart-area" points="${area}"/><polyline class="chart-line" points="${points}"/>${dots}${labels}`;
}

function renderDetail() {
  const stats = selectedStats();
  ui.eco.textContent = selectedOpening.eco;
  ui.family.textContent = selectedOpening.family;
  ui.name.textContent = selectedOpening.name;
  ui.description.textContent = selectedVariation ? `${selectedOpening.description} Linha em foco: ${selectedVariation.name}.` : selectedOpening.description;
  ui.moves.innerHTML = selectedOpening.san.map((move) => `<span class="move-chip">${move}</span>`).join("");
  ui.white.textContent = percent(stats.white); ui.draw.textContent = percent(stats.draw); ui.black.textContent = percent(stats.black);
  ui.whiteBar.style.width = `${stats.white}%`; ui.drawBar.style.width = `${stats.draw}%`; ui.blackBar.style.width = `${stats.black}%`;
  ui.sample.textContent = selectedVariation ? "linha em foco" : selectedOpening.sample;
  ui.variations.innerHTML = selectedOpening.variations.map((variation, index) => `
    <button class="variation-row ${selectedVariation === variation ? "is-active" : ""}" type="button" data-variation="${index}">
      <span><strong>${variation.name}</strong><span>${variation.moves}</span></span>
      <span class="variation-result">${variation.stats.white}% cl.</span>
    </button>`).join("");
  ui.boardLink.href = `index.html?line=${selectedOpening.moves.join(",")}`;
  ui.boardLink.innerHTML = `Experimentar ${selectedVariation ? selectedVariation.name : "no tabuleiro"} <span>→</span>`;
  renderChart();
}

function render() {
  ui.total.textContent = OPENINGS.length;
  renderFilters();
  renderList();
  renderDetail();
}

ui.search.addEventListener("input", (event) => { query = event.target.value; renderList(); });
ui.filters.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-family]");
  if (!button) return;
  activeFamily = button.dataset.family;
  renderFilters(); renderList();
});
ui.list.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-opening]");
  if (!button) return;
  selectedOpening = findOpeningById(button.dataset.opening);
  selectedVariation = null;
  window.history.replaceState({}, "", `?opening=${selectedOpening.id}`);
  renderList(); renderDetail();
});
ui.variations.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-variation]");
  if (!button) return;
  const variation = selectedOpening.variations[Number(button.dataset.variation)];
  selectedVariation = selectedVariation === variation ? null : variation;
  renderDetail();
});

render();
