import { Typography } from "@mui/material";

export type HighlightedTextProps = {
  readonly text: string;
  readonly hightlight: readonly string[];
};
export function HighlightedText({ text, hightlight }: HighlightedTextProps) {
  const regex = new RegExp(`(${hightlight.join("|")})`, "gi");
  const parts = text.split(regex);
  return (
    <Typography>
      {parts.map((part, index) => {
        if (hightlight.some((h) => h.toLowerCase() === part.toLowerCase())) {
          return (
            <span
              key={index}
              style={{
                backgroundColor: "#ffeb3b",
                fontWeight: "bold",
              }}
            >
              {part}
            </span>
          );
        }
        return part;
      })}
    </Typography>
  );
}
