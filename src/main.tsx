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
import "@fontsource/open-sans/400.css";
import "@fontsource/open-sans/500.css";
import "@fontsource/open-sans/700.css";
import "@fontsource/montserrat/400.css";
import "@fontsource/montserrat/500.css";
import "@fontsource/montserrat/700.css";
import "@fontsource/scoutie-sans/400.css";
import "@fontsource/scoutie-sans/500.css";
import "@fontsource/scoutie-sans/700.css";
import "@fontsource/valley-sans/400.css";
import "@fontsource/valley-sans/500.css";
import "@fontsource/valley-sans/700.css";
import "./index.css";

registerCorePlugin();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
