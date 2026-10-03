import { createFileRoute } from "@tanstack/react-router";
import { GameBoard } from "@/components/GameBoard";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Vibe/Vibe — Match-3 Puzzle Game" },
      {
        name: "description",
        content:
          "Swipe to match adorable characters, trigger striped, wrapped and color bomb combos, and chase huge combo scores in this polished match-3 puzzle.",
      },
      { property: "og:title", content: "Vibe/Vibe" },
      {
        property: "og:description",
        content:
          "A juicy match-3 puzzle with special combos, chain reactions and satisfying pops.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <main className="game-page">
      <h1 className="sr-only">Vibe/Vibe match-3 puzzle game</h1>
      <GameBoard />
    </main>
  );
}