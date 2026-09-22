import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import Settings from "./Settings";

// The Settings window loads this same bundle (see src-tauri/src/settings_window.rs);
// the hash tells it apart from the overlay without needing a router.
const isSettingsWindow = window.location.hash === "#settings";

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>{isSettingsWindow ? <Settings /> : <App />}</React.StrictMode>,
);
