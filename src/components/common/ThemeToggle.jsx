import { useTheme } from "../../context/ThemeContext";
import { Sun, Moon } from "lucide-react";

export default function ThemeToggle() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";

  return (
    <button
      type="button"
      className="egse-theme-toggle"
      onClick={toggleTheme}
      title={isDark ? "Switch to Light Mode" : "Switch to Dark Mode"}
      aria-label="Toggle light or dark theme"
    >
      {isDark ? (
        <Moon size={14} className="text-info" />
      ) : (
        <Sun size={14} style={{ color: "#d97706" }} />
      )}
      <span className="d-none d-sm-inline fw-semibold" style={{ fontSize: "0.82rem" }}>
        {isDark ? "Dark" : "Light"}
      </span>
    </button>
  );
}
