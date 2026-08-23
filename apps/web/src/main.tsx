import React from "react";
import ReactDOM from "react-dom/client";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/query-client";
import { initSentry } from "@/lib/sentry";
import App from "@/App";
import "@/theme/tokens.css";

// Class-based dark mode (see theme/tokens.css). The active template decides
// its own default (Nova is dark-first, Atlas is light-first) once branding
// resolves — see templates/TemplateProvider.tsx.

initSentry();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <App />
    </QueryClientProvider>
  </React.StrictMode>,
);
