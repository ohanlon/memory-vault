import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import { registerCorePlugin } from "./plugins/core";
import "@fontsource/arimo/400.css";
import "@fontsource/arimo/500.css";
import "@fontsource/arimo/600.css";
import "@fontsource/arimo/700.css";
import "@fontsource/roboto/400.css";
import "@fontsource/roboto/500.css";
import "@fontsource/roboto/700.css";
import "./index.css";

registerCorePlugin();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
