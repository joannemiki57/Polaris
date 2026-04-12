import "./figma-styles.css";

interface Props {
  title: string;
  markdown: string;
  isOpen: boolean;
  onToggle: () => void;
}

function renderMarkdown(md: string): string {
  return md
    .replace(/^### (.+)$/gm, '<h3 class="fg-dp-h3">$1</h3>')
    .replace(/^## (.+)$/gm, '<h2 class="fg-dp-h2">$1</h2>')
    .replace(/^# (.+)$/gm, '<h1 class="fg-dp-h1">$1</h1>')
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(
      /\[([^\]]+)\]\(([^)]+)\)/g,
      '<a href="$2" target="_blank" rel="noreferrer">$1</a>',
    )
    .replace(/^- (.+)$/gm, "<li>$1</li>")
    .replace(/\n{2,}/g, "<br/><br/>")
    .replace(/\n/g, "<br/>");
}

export function DeepPanel({ title, markdown, isOpen, onToggle }: Props) {
  return (
    <div className={`fg-deep-panel ${isOpen ? "fg-deep-panel-open" : ""}`}>
      <button className="fg-dp-toggle" type="button" onClick={onToggle}>
        {isOpen ? "\u25BC" : "\u25B2"} Deep Panel &middot;{" "}
        {markdown ? "Ready" : "Waiting"}
      </button>

      {isOpen && markdown && (
        <div className="fg-dp-content">
          <h2 className="fg-dp-title">{title}</h2>
          <div
            className="fg-dp-body"
            dangerouslySetInnerHTML={{ __html: renderMarkdown(markdown) }}
          />
        </div>
      )}

      {isOpen && !markdown && (
        <div className="fg-dp-content">
          <p className="fg-dp-empty">
            Select a node and run &quot;Deep Answer&quot; to see a research
            summary here.
          </p>
        </div>
      )}
    </div>
  );
}
