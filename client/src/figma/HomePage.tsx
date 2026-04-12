import { useRef } from "react";

interface Props {
  onContinue: () => void;
}

export function HomePage({ onContinue }: Props) {
  const doneRef = useRef(false);

  const finish = () => {
    if (doneRef.current) return;
    doneRef.current = true;
    onContinue();
  };

  return (
    <div className="fg-home">
      <div className="fg-home-ambient" aria-hidden />
      <div className="fg-home-grid" aria-hidden />
      
      {/* Abstract blurred aurora element instead of literal stars */}
      <div className="fg-home-aurora">
        <div className="fg-aurora-shape fg-aurora-1" />
        <div className="fg-aurora-shape fg-aurora-2" />
      </div>

      <div className="fg-home-bg">
        <div className="fg-splash-copy">
          <p className="fg-splash-eyebrow">Research exploration</p>
          <h1 className="fg-title">Polaris</h1>
          <p className="fg-tagline">
            Map ideas from real papers — then expand, cite, and go deep.
          </p>
        </div>

        <button type="button" className="fg-hero-btn" onClick={finish}>
          <span className="fg-hero-btn-text">Enter Workspace</span>
          <span className="fg-hero-btn-glow" aria-hidden />
        </button>
      </div>
    </div>
  );
}
