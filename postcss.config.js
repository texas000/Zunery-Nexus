// Tailwind v4 uses @tailwindcss/vite plugin, not a PostCSS plugin.
// Only autoprefixer is needed here.
module.exports = {
  plugins: {
    autoprefixer: {}
  }
}
