export const SIZE = 8;
export const COLORS = 3;

export type Special = "none" | "striped-h" | "striped-v" | "wrapped" | "bomb";

export interface Piece {
  id: number;
  color: number; // 0..COLORS-1 ; -1 for color bomb (colorless)
  special: Special;
}

export type Board = (Piece | null)[];

let nextId = 1;
export const makePiece = (color: number, special: Special = "none"): Piece => ({
  id: nextId++,
  color,
  special,
});

export const idx = (r: number, c: number) => r * SIZE + c;
export const rowOf = (i: number) => Math.floor(i / SIZE);
export const colOf = (i: number) => i % SIZE;

const randColor = () => Math.floor(Math.random() * COLORS);

export interface Run {
  cells: number[];
  horizontal: boolean;
}

export function findRuns(board: Board): Run[] {
  const runs: Run[] = [];
  // horizontal
  for (let r = 0; r < SIZE; r++) {
    let start = 0;
    for (let c = 1; c <= SIZE; c++) {
      const prev = board[idx(r, c - 1)];
      const cur = c < SIZE ? board[idx(r, c)] : null;
      const same =
        cur && prev && cur.color === prev.color && cur.color >= 0 && prev.color >= 0;
      if (!same) {
        if (c - start >= 3) {
          const cells: number[] = [];
          for (let k = start; k < c; k++) cells.push(idx(r, k));
          runs.push({ cells, horizontal: true });
        }
        start = c;
      }
    }
  }
  // vertical
  for (let c = 0; c < SIZE; c++) {
    let start = 0;
    for (let r = 1; r <= SIZE; r++) {
      const prev = board[idx(r - 1, c)];
      const cur = r < SIZE ? board[idx(r, c)] : null;
      const same =
        cur && prev && cur.color === prev.color && cur.color >= 0 && prev.color >= 0;
      if (!same) {
        if (r - start >= 3) {
          const cells: number[] = [];
          for (let k = start; k < r; k++) cells.push(idx(k, c));
          runs.push({ cells, horizontal: false });
        }
        start = r;
      }
    }
  }
  return runs;
}

export interface MatchGroup {
  cells: number[];
  hasH: boolean;
  hasV: boolean;
  size: number;
  maxRun: number;
  color: number;
}

export function groupRuns(board: Board, runs: Run[]): MatchGroup[] {
  const groups: MatchGroup[] = [];
  const used = new Set<number>();
  for (const run of runs) {
    if (run.cells.every((c) => used.has(c))) continue;
    // gather connected runs
    const stack = [run];
    const cells = new Set<number>();
    let hasH = false;
    let hasV = false;
    let maxRun = 0;
    const seenRuns = new Set<Run>([run]);
    while (stack.length) {
      const cur = stack.pop()!;
      cur.horizontal ? (hasH = true) : (hasV = true);
      maxRun = Math.max(maxRun, cur.cells.length);
      cur.cells.forEach((c) => cells.add(c));
      for (const other of runs) {
        if (seenRuns.has(other)) continue;
        if (other.cells.some((c) => cells.has(c))) {
          seenRuns.add(other);
          stack.push(other);
        }
      }
    }
    cells.forEach((c) => used.add(c));
    const first = board[[...cells][0] ?? 0];
    groups.push({
      cells: [...cells],
      hasH,
      hasV,
      size: cells.size,
      maxRun,
      color: first ? first.color : 0,
    });
  }
  return groups;
}

export function getGroups(board: Board): MatchGroup[] {
  return groupRuns(board, findRuns(board));
}

export function hasMatch(board: Board) {
  return findRuns(board).length > 0;
}

export function createBoard(): Board {
  let board: Board;
  do {
    board = Array.from({ length: SIZE * SIZE }, () => makePiece(randColor()));
    // remove initial matches
    let guard = 0;
    while (hasMatch(board) && guard++ < 200) {
      for (const g of getGroups(board)) {
        for (const c of g.cells) board[c] = makePiece(randColor());
      }
    }
  } while (!hasPossibleMove(board));
  return board;
}

export function swapped(board: Board, a: number, b: number): Board {
  const nb = board.slice();
  const t = nb[a] ?? null;
  nb[a] = nb[b] ?? null;
  nb[b] = t;
  return nb;
}

export function areAdjacent(a: number, b: number) {
  const dr = Math.abs(rowOf(a) - rowOf(b));
  const dc = Math.abs(colOf(a) - colOf(b));
  return dr + dc === 1;
}

export function hasPossibleMove(board: Board) {
  for (let i = 0; i < board.length; i++) {
    const p = board[i];
    if (p && (p.special === "bomb" || p.special !== "none")) return true;
    const c = colOf(i);
    const r = rowOf(i);
    if (c < SIZE - 1 && hasMatch(swapped(board, i, i + 1))) return true;
    if (r < SIZE - 1 && hasMatch(swapped(board, i, i + SIZE))) return true;
  }
  return false;
}

/** Expand a set of cleared cells by triggering special candies (recursively). */
export function resolveSpecials(
  board: Board,
  initial: number[],
  bombColor?: number,
): { cleared: Set<number>; blasts: { index: number; special: Special }[] } {
  const cleared = new Set<number>();
  const blasts: { index: number; special: Special }[] = [];
  const queue = [...initial];
  while (queue.length) {
    const i = queue.shift()!;
    if (i < 0 || i >= SIZE * SIZE) continue;
    if (cleared.has(i)) continue;
    const p = board[i];
    if (!p) continue;
    cleared.add(i);
    if (p.special !== "none") {
      blasts.push({ index: i, special: p.special });
      const r = rowOf(i);
      const c = colOf(i);
      if (p.special === "striped-h") {
        for (let k = 0; k < SIZE; k++) queue.push(idx(r, k));
      } else if (p.special === "striped-v") {
        for (let k = 0; k < SIZE; k++) queue.push(idx(k, c));
      } else if (p.special === "wrapped") {
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const rr = r + dr;
            const cc = c + dc;
            if (rr >= 0 && rr < SIZE && cc >= 0 && cc < SIZE) queue.push(idx(rr, cc));
          }
      } else if (p.special === "bomb") {
        const target = bombColor ?? mostCommonColor(board);
        for (let k = 0; k < board.length; k++) {
          if (board[k]?.color === target) queue.push(k);
        }
      }
    }
  }
  return { cleared, blasts };
}

export function mostCommonColor(board: Board) {
  const counts = new Array(COLORS).fill(0);
  board.forEach((p) => {
    if (p && p.color >= 0) counts[p.color]++;
  });
  return counts.indexOf(Math.max(...counts));
}

export function specialForGroup(g: MatchGroup): Special | null {
  if (g.maxRun >= 5) return "bomb";
  if (g.hasH && g.hasV) return "wrapped";
  if (g.maxRun === 4) return g.hasH ? "striped-v" : "striped-h";
  return null;
}

/** Gravity: move pieces down, fill top with new pieces. Returns new board + spawned ids. */
export function collapse(board: Board): { board: Board; spawned: Set<number> } {
  const nb = board.slice();
  const spawned = new Set<number>();
  for (let c = 0; c < SIZE; c++) {
    let write = SIZE - 1;
    for (let r = SIZE - 1; r >= 0; r--) {
      const p = nb[idx(r, c)];
      if (p) {
        nb[idx(write, c)] = p;
        if (write !== r) nb[idx(r, c)] = null;
        write--;
      }
    }
    for (let r = write; r >= 0; r--) {
      const p = makePiece(randColor());
      spawned.add(p.id);
      nb[idx(r, c)] = p;
    }
  }
  return { board: nb, spawned };
}