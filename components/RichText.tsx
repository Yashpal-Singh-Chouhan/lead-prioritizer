// Shows AI chat answers nicely. The model often answers with simple markdown (**bold**, "- " bullets,
// "1. " steps, "## " headings); we render just those pieces as plain React elements (no HTML injection).
import { Fragment } from "react";

function inline(text: string) {
  // split on **bold** spans; odd parts are the bold ones
  return text.split(/\*\*(.+?)\*\*/g).map((part, i) => (i % 2 ? <strong key={i}>{part}</strong> : <Fragment key={i}>{part}</Fragment>));
}

export default function RichText({ text }: { text: string }) {
  const lines = text.replace(/\r/g, "").split("\n");
  return (
    <div className="space-y-1">
      {lines.map((raw, i) => {
        const line = raw.trimEnd();
        if (!line.trim()) return <div key={i} className="h-1" />;
        const heading = line.match(/^#{1,4}\s+(.*)$/);
        if (heading) return <p key={i} className="pt-1 font-semibold">{inline(heading[1])}</p>;
        const bullet = line.match(/^(\s*)[-*•]\s+(.*)$/);
        if (bullet)
          return (
            <p key={i} className="flex gap-2" style={{ paddingLeft: bullet[1].length ? 16 : 0 }}>
              <span aria-hidden>•</span>
              <span>{inline(bullet[2])}</span>
            </p>
          );
        const step = line.match(/^(\s*)(\d+)[.)]\s+(.*)$/);
        if (step)
          return (
            <p key={i} className="flex gap-2" style={{ paddingLeft: step[1].length ? 16 : 0 }}>
              <span className="font-semibold">{step[2]}.</span>
              <span>{inline(step[3])}</span>
            </p>
          );
        return <p key={i}>{inline(line)}</p>;
      })}
    </div>
  );
}
