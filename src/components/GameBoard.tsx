import { useCallback, useEffect, useRef, useState } from "react";
import { Candy, CHARACTERS } from "./Candy";
import { sfx } from "@/lib/sfx";
import { Bomb, Flame, Hammer, Home, RotateCcw, Shuffle, Volume2, VolumeX } from "lucide-react";
import forestBg from "@/assets/backgrounds/forest.png";
import {
  SIZE,
  areAdjacent,
  collapse,
  colOf,
  createBoard,
  getGroups,
  hasPossibleMove,
  idx,
  makePiece,
  resolveSpecials,
  rowOf,
  specialForGroup,
  swapped,
  type Board,
  type Piece,
} from "@/lib/match3";

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface Floater {
  id: number;
  x: number;
  y: number;
  text: string;
  big: boolean;
}
interface Spark {
  id: number;
  x: number;
  y: number;
  dx: number;
  dy: number;
  color: number;
}

let fxId = 1;

export function GameBoard() {
  const [board, setBoard] = useState<Board>(() => Array<Piece | null>(SIZE * SIZE).fill(null));
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(0);
  const [selected, setSelected] = useState<number | null>(null);
  const [clearing, setClearing] = useState<Set<number>>(new Set());
  const [nudge, setNudge] = useState<{ a: number; b: number } | null>(null);
  const [floaters, setFloaters] = useState<Floater[]>([]);
  const [sparks, setSparks] = useState<Spark[]>([]);
  const [shake, setShake] = useState(0);
  const [paused, setPaused] = useState(false);
  const [combo, setCombo] = useState(0);
  const [stage, setStage] = useState<"landing" | "playing">("landing");
  const [muted, setMuted] = useState(false);
  const [boosters, setBoosters] = useState({ hammer: 0, shuffle: 0, bomb: 0 });
  const [activeBooster, setActiveBooster] = useState<"hammer" | null>(null);
  const prevScoreRef = useRef(0);
  const busy = useRef(false);
  const dragStart = useRef<{ i: number; x: number; y: number } | null>(null);

  useEffect(() => {
    sfx.setMuted(muted);
  }, [muted]);

  const addFloater = useCallback((cell: number, text: string, big = false) => {
    const f: Floater = {
      id: fxId++,
      x: colOf(cell) + 0.5,
      y: rowOf(cell) + 0.5,
      text,
      big,
    };
    setFloaters((p) => [...p, f]);
    setTimeout(() => setFloaters((p) => p.filter((x) => x.id !== f.id)), 900);
  }, []);

  // Boosters unlock at score milestones: hammer every 1000, shuffle every 2500, bomb every 5000.
  useEffect(() => {
    const prev = prevScoreRef.current;
    prevScoreRef.current = score;
    const hammerGained = Math.floor(score / 1000) - Math.floor(prev / 1000);
    const shuffleGained = Math.floor(score / 2500) - Math.floor(prev / 2500);
    const bombGained = Math.floor(score / 5000) - Math.floor(prev / 5000);
    if (hammerGained > 0 || shuffleGained > 0 || bombGained > 0) {
      setBoosters((b) => ({
        hammer: b.hammer + hammerGained,
        shuffle: b.shuffle + shuffleGained,
        bomb: b.bomb + bombGained,
      }));
      sfx.special();
      addFloater(idx(4, 4), "Booster unlocked!", true);
    }
  }, [score, addFloater]);

  const startGame = useCallback(() => {
    sfx.init();
    sfx.start();
    setBoard(createBoard());
    setScore(0);
    setSelected(null);
    setPaused(false);
    setStage("playing");
  }, []);

  useEffect(() => {
    setBest((b) => (score > b ? score : b));
  }, [score]);

  const burst = useCallback((cells: number[], colorOf: (i: number) => number) => {
    const newSparks: Spark[] = [];
    for (const i of cells) {
      const cx = colOf(i) + 0.5;
      const cy = rowOf(i) + 0.5;
      for (let k = 0; k < 8; k++) {
        const ang = Math.random() * Math.PI * 2;
        const dist = 30 + Math.random() * 50;
        newSparks.push({
          id: fxId++,
          x: cx,
          y: cy,
          dx: Math.cos(ang) * dist,
          dy: Math.sin(ang) * dist,
          color: colorOf(i),
        });
      }
    }
    setSparks((s) => [...s, ...newSparks]);
    const ids = new Set(newSparks.map((s) => s.id));
    setTimeout(() => setSparks((s) => s.filter((x) => !ids.has(x.id))), 850);
  }, []);

  /** Clear a set of cells, animate, collapse, and cascade. */
  const runCascade = useCallback(
    async (startBoard: Board, forced?: { cells: number[]; bombColor?: number | undefined }) => {
      let current = startBoard;
      let chain = 0;

      if (forced) {
        const { cleared, blasts } = resolveSpecials(
          current,
          forced.cells,
          forced.bombColor,
        );
        current = await popCells(current, cleared, blasts.length, 1);
      }

      // eslint-disable-next-line no-constant-condition
      while (true) {
        const groups = getGroups(current);
        if (groups.length === 0) break;
        chain++;
        setCombo(chain);
        if (chain > 1) sfx.combo(chain);

        const promoted: { index: number; piece: Piece }[] = [];
        const toClear: number[] = [];
        for (const g of groups) {
          const sp = specialForGroup(g);
          toClear.push(...g.cells);
          if (sp) {
            const at = g.cells[Math.floor(g.cells.length / 2)] ?? g.cells[0]!;
            promoted.push({
              index: at,
              piece: makePiece(sp === "bomb" ? -1 : g.color, sp),
            });
          }
        }
        const promotedSet = new Set(promoted.map((p) => p.index));
        const { cleared, blasts } = resolveSpecials(
          current,
          toClear.filter((c) => !promotedSet.has(c)),
        );
        promoted.forEach((p) => cleared.delete(p.index));
        current = await popCells(current, cleared, blasts.length, chain, promoted);
      }

      setCombo(0);
      if (!hasPossibleMove(current)) {
        // reshuffle silently
        await wait(180);
        sfx.shuffle();
        current = createBoard();
        setBoard(current);
        addFloater(idx(3, 3), "Shuffle!", true);
      }
      return current;
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [],
  );

  const popCells = useCallback(
    async (
      current: Board,
      cleared: Set<number>,
      blastCount: number,
      chain: number,
      promoted: { index: number; piece: Piece }[] = [],
    ) => {
      const cells = [...cleared];
      if (cells.length === 0) return current;

      const gained = Math.round(cells.length * 30 * (1 + (chain - 1) * 0.5));
      setScore((s) => s + gained);
      sfx.pop(chain);
      if (promoted.length > 0) sfx.special();
      if (blastCount > 0) sfx.blast();
      burst(cells, (i) => current[i]?.color ?? 0);
      const anchor = cells[Math.floor(cells.length / 2)] ?? cells[0]!;
      addFloater(anchor, `+${gained}`, chain > 1 || blastCount > 0);
      if (chain > 1) addFloater(cells[0]!, `Combo x${chain}`, true);
      if (blastCount > 0 || cells.length >= 4) {
        setShake((s) => s + 1);
        setTimeout(() => setShake((s) => Math.max(0, s - 1)), 420);
      }

      setClearing(new Set(cells));
      await wait(230);

      const nb = current.slice();
      cells.forEach((i) => (nb[i] = null));
      promoted.forEach((p) => (nb[p.index] = p.piece));
      setClearing(new Set());
      setBoard(nb);
      await wait(30);

      const { board: collapsed } = collapse(nb);
      setBoard(collapsed);
      await wait(300);
      return collapsed;
    },
    [addFloater, burst],
  );

  const trySwap = useCallback(
    async (a: number, b: number) => {
      if (busy.current || paused) return;
      if (!areAdjacent(a, b)) return;
      busy.current = true;
      setSelected(null);

      const pa = board[a];
      const pb = board[b];
      if (!pa || !pb) {
        busy.current = false;
        return;
      }

      const swappedBoard = swapped(board, a, b);
      const bombInvolved = pa.special === "bomb" || pb.special === "bomb";
      const bothSpecial = pa.special !== "none" && pb.special !== "none";

      if (bombInvolved || (bothSpecial && getGroups(swappedBoard).length === 0)) {
        sfx.swap();
        setBoard(swappedBoard);
        await wait(200);
        let cells = [a, b];
        let bombColor: number | undefined;
        if (bombInvolved) {
          const other = pa.special === "bomb" ? pb : pa;
          bombColor = other.color >= 0 ? other.color : undefined;
          if (other.special === "bomb") {
            cells = swappedBoard.map((_, i) => i);
          }
        }
        await runCascade(swappedBoard, { cells, bombColor });
        busy.current = false;
        return;
      }

      if (getGroups(swappedBoard).length === 0) {
        sfx.invalid();
        setNudge({ a, b });
        await wait(180);
        setNudge(null);
        busy.current = false;
        return;
      }

      sfx.swap();

      setBoard(swappedBoard);
      await wait(200);
      await runCascade(swappedBoard);
      busy.current = false;
    },
    [board, paused, runCascade],
  );

  const useHammer = useCallback(() => {
    if (boosters.hammer <= 0 || busy.current || paused) return;
    sfx.click();
    setActiveBooster((b) => (b === "hammer" ? null : "hammer"));
  }, [boosters.hammer, paused]);

  const useShuffleBooster = useCallback(async () => {
    if (boosters.shuffle <= 0 || busy.current || paused) return;
    busy.current = true;
    setBoosters((b) => ({ ...b, shuffle: b.shuffle - 1 }));
    sfx.shuffle();
    setBoard(createBoard());
    await wait(50);
    busy.current = false;
  }, [boosters.shuffle, paused]);

  const useBombBooster = useCallback(async () => {
    if (boosters.bomb <= 0 || busy.current || paused) return;
    busy.current = true;
    setBoosters((b) => ({ ...b, bomb: b.bomb - 1 }));
    const center = Math.floor(Math.random() * SIZE * SIZE);
    const cr = rowOf(center);
    const cc = colOf(center);
    const cells: number[] = [];
    for (let dr = -1; dr <= 1; dr++) {
      for (let dc = -1; dc <= 1; dc++) {
        const r = cr + dr;
        const c = cc + dc;
        if (r >= 0 && r < SIZE && c >= 0 && c < SIZE) cells.push(idx(r, c));
      }
    }
    sfx.blast();
    await runCascade(board, { cells });
    busy.current = false;
  }, [boosters.bomb, paused, board, runCascade]);

  const onPointerDown = (i: number) => (e: React.PointerEvent) => {
    if (busy.current || paused) return;
    if (activeBooster === "hammer") {
      setActiveBooster(null);
      setBoosters((b) => ({ ...b, hammer: b.hammer - 1 }));
      busy.current = true;
      sfx.blast();
      void runCascade(board, { cells: [i] }).then(() => {
        busy.current = false;
      });
      return;
    }
    dragStart.current = { i, x: e.clientX, y: e.clientY };
    setSelected((prev) => {
      if (prev !== null && areAdjacent(prev, i)) {
        void trySwap(prev, i);
        return null;
      }
      if (prev !== i) sfx.select();
      return prev === i ? null : i;
    });
  };

  const onPointerUp = (e: React.PointerEvent) => {
    const start = dragStart.current;
    dragStart.current = null;
    if (!start) return;
    const dx = e.clientX - start.x;
    const dy = e.clientY - start.y;
    if (Math.abs(dx) < 14 && Math.abs(dy) < 14) return;
    const r = rowOf(start.i);
    const c = colOf(start.i);
    let target = -1;
    if (Math.abs(dx) > Math.abs(dy)) {
      const nc = c + (dx > 0 ? 1 : -1);
      if (nc >= 0 && nc < SIZE) target = idx(r, nc);
    } else {
      const nr = r + (dy > 0 ? 1 : -1);
      if (nr >= 0 && nr < SIZE) target = idx(nr, c);
    }
    if (target >= 0) {
      setSelected(null);
      void trySwap(start.i, target);
    }
  };

  const restart = () => {
    if (busy.current) return;
    setBoard(createBoard());
    setScore(0);
    setSelected(null);
    setPaused(false);
  };

  if (stage === "landing") {
    return (
      <>
        <div className="game-bg" style={{ backgroundImage: `url(${forestBg})` }} />
        <div className="landing">
          <button
            className="hud-btn landing-mute"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <div className="landing-candies" aria-hidden="true">
            {CHARACTERS.map((src, i) => (
              <img key={i} src={src} alt="" className="landing-char" />
            ))}
          </div>
          <h1 className="landing-title">Vibe/Vibe</h1>
          <p className="landing-tagline">
            Swipe to match Vibe/Vibe, chain huge combos, and beat your best score.
          </p>
          <button className="landing-play" onClick={startGame}>
            Play
          </button>
          {best > 0 && <p className="landing-best">Best score {best.toLocaleString()}</p>}
        </div>
      </>
    );
  }

  const pieces: { piece: Piece; index: number }[] = [];
  board.forEach((p, i) => {
    if (p) pieces.push({ piece: p, index: i });
  });
  pieces.sort((x, y) => x.piece.id - y.piece.id);

  return (
    <>
      <div className="game-bg is-blurred" style={{ backgroundImage: `url(${forestBg})` }} />
      <div className="game-wrap">
      <header className="hud">
        <div className="hud-score">
          <span className="hud-label">Score</span>
          <span className="hud-value">{score.toLocaleString()}</span>
        </div>
        <div className="hud-actions">
          <button
            className="hud-btn"
            onClick={() => setMuted((m) => !m)}
            aria-label={muted ? "Unmute" : "Mute"}
          >
            {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
          </button>
          <button
            className="hud-btn"
            onClick={() => {
              sfx.click();
              restart();
            }}
            aria-label="Restart"
          >
            <RotateCcw size={18} />
          </button>
          <button
            className="hud-btn"
            onClick={() => {
              sfx.click();
              setStage("landing");
            }}
            aria-label="Home"
          >
            <Home size={18} />
          </button>
        </div>
      </header>

      <div className="boosters-bar">
        <button
          className={`booster-btn ${activeBooster === "hammer" ? "is-active" : ""}`}
          onClick={useHammer}
          disabled={boosters.hammer <= 0}
          aria-label="Hammer booster: destroy one candy"
        >
          <Hammer size={17} />
          <span className="booster-count">{boosters.hammer}</span>
        </button>
        <button
          className="booster-btn"
          onClick={() => void useShuffleBooster()}
          disabled={boosters.shuffle <= 0}
          aria-label="Shuffle booster: reshuffle the board"
        >
          <Shuffle size={17} />
          <span className="booster-count">{boosters.shuffle}</span>
        </button>
        <button
          className="booster-btn"
          onClick={() => void useBombBooster()}
          disabled={boosters.bomb <= 0}
          aria-label="Bomb booster: blast a 3x3 area"
        >
          <Bomb size={17} />
          <span className="booster-count">{boosters.bomb}</span>
        </button>
      </div>

      <div className={`board-shell ${shake > 0 ? "is-shaking" : ""}`}>
        <div className="board" onPointerUp={onPointerUp} onPointerLeave={onPointerUp}>
          {Array.from({ length: SIZE * SIZE }, (_, i) => (
            <span
              key={`cell-${i}`}
              className="cell"
              style={{
                left: `calc(${colOf(i)} * var(--tile))`,
                top: `calc(${rowOf(i)} * var(--tile))`,
              }}
            />
          ))}

          {pieces.map(({ piece, index }) => (
            <div
              key={piece.id}
              className={`tile ${selected === index ? "is-selected" : ""} ${
                clearing.has(index) ? "is-popping" : ""
              } ${nudge && (nudge.a === index || nudge.b === index) ? "is-nudging" : ""}`}
              style={{
                transform: `translate3d(calc(${colOf(index)} * var(--tile)), calc(${rowOf(
                  index,
                )} * var(--tile)), 0)`,
              }}
              onPointerDown={onPointerDown(index)}
            >
              <Candy piece={piece} />
            </div>
          ))}

          {sparks.map((s) => (
            <span
              key={s.id}
              className={`spark candy-${s.color}`}
              style={
                {
                  left: `calc(${s.x} * var(--tile))`,
                  top: `calc(${s.y} * var(--tile))`,
                  "--dx": `${s.dx}px`,
                  "--dy": `${s.dy}px`,
                } as React.CSSProperties
              }
            />
          ))}

          {floaters.map((f) => (
            <span
              key={f.id}
              className={`floater ${f.big ? "is-big" : ""}`}
              style={{
                left: `calc(${f.x} * var(--tile))`,
                top: `calc(${f.y} * var(--tile))`,
              }}
            >
              {f.text}
            </span>
          ))}

          {combo > 1 && (
            <span className={`combo-badge tier-${Math.min(combo, 5)}`}>
              <Flame size={15} />
              Combo ×{combo}
            </span>
          )}

          {paused && (
            <div className="pause-overlay">
              <p className="pause-title">Paused</p>
              <button className="pause-btn" onClick={() => setPaused(false)}>
                Resume
              </button>
              <button className="pause-btn is-ghost" onClick={restart}>
                Restart
              </button>
            </div>
          )}
        </div>
      </div>

      <p className="hint">Best {best.toLocaleString()} · swipe candies to match 3+</p>
      </div>
    </>
  );
}