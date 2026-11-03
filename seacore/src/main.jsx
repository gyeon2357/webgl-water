import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import "./styles/index.css"
import "./styles/reset.css"
import App from "./App.jsx"

// The hero section now has real scroll height (see App.jsx's scroll
// hand-off), so on a reload/back-forward navigation the browser's default
// scroll-position restoration would jump straight back to wherever the
// page was left scrolled to - before the intro/lock CSS has even applied,
// which is exactly what showed up as the brand-intro section flashing in
// (or the page looking briefly darker mid-transition) on a second load.
// Turning restoration off up front and forcing the page back to the top
// makes every load start from the same clean intro state.
if ("scrollRestoration" in window.history) {
  window.history.scrollRestoration = "manual"
}
window.scrollTo(0, 0)

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>
)
