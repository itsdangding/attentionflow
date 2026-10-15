import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import WeeklyReceipt from "./WeeklyReceipt";
import "./style.css";
import "./receipt.css";

createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
    <WeeklyReceipt />
  </React.StrictMode>,
);
