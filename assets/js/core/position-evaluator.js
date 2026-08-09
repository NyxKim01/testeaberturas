import { matchOpening, openingContinuation } from "../data/openings.js";
import { boardUtils } from "./chess-game.js";

const { colorOf, typeOf, squareOf } = boardUtils;
const PIECE_VALUE = { p: 100, n: 320, b: 330, r: 500, q: 900, k: 0 };
const CENTER = new Set(["d4", "e4", "d5", "e5"]);

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function normalize(stats) {
  const sum = stats.white + stats.draw + stats.black;
  return { white: (stats.white / sum) * 100, draw: (stats.draw / sum) * 100, black: (stats.black / sum) * 100 };
}

export function probabilitiesFromCentipawns(centipawns) {
  const capped = clamp(centipawns, -900, 900);
  const draw = clamp(34 - Math.abs(capped) / 38, 10, 34);
  const decisive = 100 - draw;
  const whiteShare = 1 / (1 + Math.exp(-capped / 165));
  return { white: decisive * whiteShare, draw, black: decisive * (1 - whiteShare) };
}

export class PositionEvaluator {
  evaluate(game) {
    let score = 0;
    let whiteMaterial = 0;
    let blackMaterial = 0;
    let whiteDevelopment = 0;
    let blackDevelopment = 0;

    game.board.forEach((piece, index) => {
      if (!piece) return;
      const color = colorOf(piece);
      const type = typeOf(piece);
      const sign = color === "w" ? 1 : -1;
      const square = squareOf(index);
      const value = PIECE_VALUE[type];
      score += sign * value;
      if (color === "w") whiteMaterial += value; else blackMaterial += value;

      if (type === "p" && CENTER.has(square)) score += sign * 18;
      if ((type === "n" || type === "b") && !["b1", "g1", "b8", "g8", "c1", "f1", "c8", "f8"].includes(square)) {
        score += sign * 12;
        if (color === "w") whiteDevelopment += 1; else blackDevelopment += 1;
      }
      if (type === "p" && ["d4", "e4", "d5", "e5"].includes(square)) score += sign * 7;
      if (type === "k" && ["g1", "c1"].includes(square)) score += 24;
      if (type === "k" && ["g8", "c8"].includes(square)) score -= 24;
      if ((type === "n" || type === "b") && ["d4", "e4", "d5", "e5"].includes(square)) score += sign * 9;
    });

    const moveNumber = game.moves.length;
    if (moveNumber < 14) score += (whiteDevelopment - blackDevelopment) * 5;
    if (game.isInCheck("w")) score -= 36;
    if (game.isInCheck("b")) score += 36;
    // A pequena margem inicial evita fingir que a posição inicial é exatamente uma moeda justa.
    if (moveNumber === 0) score = 4;

    const opening = matchOpening(game.moves.map((move) => move.uci));
    const base = probabilitiesFromCentipawns(score);
    let probabilities = base;
    if (opening && game.moves.length <= opening.moves.length + 6) {
      const historical = normalize(opening.stats);
      const historyWeight = Math.max(.14, .4 - game.moves.length * .022);
      probabilities = {
        white: base.white * (1 - historyWeight) + historical.white * historyWeight,
        draw: base.draw * (1 - historyWeight) + historical.draw * historyWeight,
        black: base.black * (1 - historyWeight) + historical.black * historyWeight,
      };
    }

    return {
      centipawns: Math.round(score),
      probabilities,
      opening,
      continuation: openingContinuation(game.moves.map((move) => move.uci)),
      material: { white: whiteMaterial, black: blackMaterial },
      source: "Maré Neural",
    };
  }
}

const STOCKFISH_SCRIPT = "https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18-lite-single.js";
const STOCKFISH_WASM = "https://github.com/nmrugg/stockfish.js/releases/download/v18.0.0/stockfish-18-lite-single.wasm";

/**
 * Carrega a versão single-threaded e leve do Stockfish 18 sob demanda.
 * A troca para um Blob Worker permite usar o binário remoto sem travar a interface;
 * caso a rede/CORS bloqueie o download, a interface segue com a Maré Neural local.
 */
export class StockfishBridge {
  constructor({ onStatus = () => {} } = {}) {
    this.onStatus = onStatus;
    this.worker = null;
    this.ready = false;
    this.loading = false;
    this.pending = null;
  }

  async start() {
    if (this.ready) return true;
    if (this.loading) return false;
    this.loading = true;
    this.onStatus("loading");
    try {
      const response = await fetch(STOCKFISH_SCRIPT, { mode: "cors" });
      if (!response.ok) throw new Error(`Não foi possível baixar o motor (${response.status}).`);
      const source = (await response.text()).replaceAll("stockfish-18-lite-single.wasm", STOCKFISH_WASM);
      const blob = new Blob([source], { type: "text/javascript" });
      const workerUrl = URL.createObjectURL(blob);
      this.worker = new Worker(workerUrl);
      URL.revokeObjectURL(workerUrl);
      this.worker.addEventListener("message", (event) => this.handleMessage(String(event.data)));
      this.worker.addEventListener("error", () => this.fail());
      this.worker.postMessage("uci");
      return await new Promise((resolve) => {
        const timeout = window.setTimeout(() => resolve(false), 12000);
        this.readyResolver = (result) => { window.clearTimeout(timeout); resolve(result); };
      });
    } catch {
      this.fail();
      return false;
    } finally {
      this.loading = false;
    }
  }

  handleMessage(line) {
    if (line === "uciok") {
      this.worker?.postMessage("setoption name Threads value 1");
      this.worker?.postMessage("isready");
      return;
    }
    if (line === "readyok") {
      this.ready = true;
      this.onStatus("ready");
      this.readyResolver?.(true);
      this.readyResolver = null;
      return;
    }
    if (!this.pending) return;
    const score = line.match(/\bscore (cp|mate) (-?\d+)/);
    if (score) {
      const numeric = Number(score[2]);
      const raw = score[1] === "mate" ? Math.sign(numeric || 1) * 1000 : numeric;
      this.pending.score = this.pending.turn === "w" ? raw : -raw;
    }
    if (line.startsWith("bestmove")) {
      const completed = this.pending;
      this.pending = null;
      completed.callback(completed.score ?? 0, line.split(" ")[1]);
    }
  }

  evaluate(fen, turn, callback) {
    if (!this.ready || !this.worker) return false;
    this.worker.postMessage("stop");
    this.pending = { callback, turn, score: 0 };
    this.worker.postMessage(`position fen ${fen}`);
    this.worker.postMessage("go depth 13");
    return true;
  }

  fail() {
    this.ready = false;
    this.pending = null;
    this.onStatus("unavailable");
    this.readyResolver?.(false);
    this.readyResolver = null;
    this.worker?.terminate();
    this.worker = null;
  }
}
