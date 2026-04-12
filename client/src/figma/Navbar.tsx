import "./figma-styles.css";

interface Props {
  onLogoClick?: () => void;
}

export function Navbar({ onLogoClick }: Props) {
  return (
    <nav className="fg-navbar">
      <button
        className="fg-navbar-brand"
        type="button"
        onClick={onLogoClick}
      >
        Polaris
      </button>
    </nav>
  );
}
