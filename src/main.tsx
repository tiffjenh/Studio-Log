import React from "react";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { LanguageProvider } from "./context/LanguageContext";
import { StoreProvider } from "./context/StoreContext";
import DesktopOnlyPhoneFrame from "./components/DesktopOnlyPhoneFrame";
import App from "./App";
import "./index.css";

if (import.meta.env.DEV) {
  (window as unknown as { __studioLogLoadedAt?: number }).__studioLogLoadedAt = Date.now();
}

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <LanguageProvider>
      <StoreProvider>
        <BrowserRouter>
          <DesktopOnlyPhoneFrame>
            <App />
          </DesktopOnlyPhoneFrame>
        </BrowserRouter>
      </StoreProvider>
    </LanguageProvider>
  </React.StrictMode>
);
