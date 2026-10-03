import type { Piece } from "@/lib/match3";
import char0 from "@/assets/characters/character-0.png";
import char1 from "@/assets/characters/character-1.png";
import char2 from "@/assets/characters/character-2.png";
import char3 from "@/assets/characters/character-3.png";
import char4 from "@/assets/characters/character-4.png";
import up0 from "@/assets/characters/upgrade-0.png";
import up1 from "@/assets/characters/upgrade-1.png";
import up2 from "@/assets/characters/upgrade-2.png";
import up3 from "@/assets/characters/upgrade-3.png";
import up4 from "@/assets/characters/upgrade-4.png";
import colorBomb from "@/assets/characters/color-bomb.png";

export const CHARACTERS = [char0, char1, char2, char3, char4];
// Powered-up art shown once 4 of the same character are matched.
const UPGRADES = [up0, up1, up2, up3, up4];

export function Candy({ piece }: { piece: Piece }) {
  if (piece.special === "bomb") {
    return (
      <div className="candy candy-bomb">
        <img className="candy-img" src={colorBomb} alt="" draggable={false} />
      </div>
    );
  }

  const isStriped = piece.special === "striped-h" || piece.special === "striped-v";
  const src = isStriped
    ? UPGRADES[piece.color] ?? CHARACTERS[piece.color] ?? CHARACTERS[0]
    : CHARACTERS[piece.color] ?? CHARACTERS[0];

  return (
    <div
      className={`candy candy-face ${piece.special === "wrapped" ? "is-wrapped" : ""} ${
        isStriped ? "is-upgraded" : ""
      }`}
    >
      <img className="candy-img" src={src} alt="" draggable={false} />
      {piece.special === "wrapped" && <span className="wrap-mark" />}
    </div>
  );
}