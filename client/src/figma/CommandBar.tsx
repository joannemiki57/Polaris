import { useState, type FormEvent } from "react";
import "./figma-styles.css";

interface Props {
  initialQuery?: string;
  onSubmit: (query: string) => void;
  isRegenerateMode?: boolean;
}

export function CommandBar({ initialQuery = "", onSubmit, isRegenerateMode }: Props) {
  const [query, setQuery] = useState(initialQuery);

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (query.trim()) onSubmit(query.trim());
  };

  const handleClear = () => setQuery("");

  return (
    <form className="fg-cmdbar" onSubmit={handleSubmit}>
      <div className="fg-cmdbar-inner">
        <img className="fg-cmdbar-icon" src="/assets/search-icon.svg" alt="" />
        <input
          className="fg-cmdbar-input"
          type="text"
          placeholder="Ask a research question..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {query && (
          <button
            className="fg-cmdbar-clear"
            type="button"
            onClick={handleClear}
            aria-label="Clear"
          >
            &times;
          </button>
        )}
        <button
          className="fg-cmdbar-submit"
          type="submit"
          disabled={!query.trim()}
        >
          {isRegenerateMode ? "Regenerate" : "Explore"}
        </button>
      </div>
    </form>
  );
}
