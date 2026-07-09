import "./lib/sentry"; // init Sentry przed renderem (no-op bez VITE_SENTRY_DSN)
import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

createRoot(document.getElementById("root")!).render(<App />);
